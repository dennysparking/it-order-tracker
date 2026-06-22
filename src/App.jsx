import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from './context/AuthContext';
import { useOrders } from './hooks/useOrders';
import { useSettings } from './hooks/useSettings';
import { useToast } from './hooks/useToast';
import { api } from './api';
import { STAGES, DELIVERED_STATUSES } from './constants';
import { S } from './styles';
import { getCurrentStage, daysSince } from './utils';
import Header from './components/Header';
import PipelineView from './components/PipelineView';
import ListView from './components/ListView';
import EmptyState from './components/EmptyState';
import OrderFormModal from './components/OrderFormModal';
import OrderDetailModal from './components/OrderDetailModal';
import SettingsModal from './components/SettingsModal';
import ImportModal from './components/ImportModal';
import FilterPanel from './components/FilterPanel';
import Toast from './components/Toast';
import SetupPage from './pages/SetupPage';
import LoginPage from './pages/LoginPage';
import AuditLogPage from './pages/AuditLogPage';
import DashboardPage from './pages/DashboardPage';

// Shimmer placeholder shown while orders load — mirrors the kanban column layout.
function SkeletonBoard() {
  return (
    <div className="pipeline-board" style={{ display: "flex", gap: 8, padding: 12, alignItems: "flex-start" }}>
      {STAGES.slice(0, 5).map((stage, c) => (
        <div key={stage.key} style={{ flex: "0 0 210px", borderRadius: 10, padding: 10, border: "1px solid var(--border-subtle)", background: stage.color + "12" }}>
          <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 12 }} />
          {Array.from({ length: 3 - (c % 2) }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8, borderRadius: 10 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { appState, setAppState, user, login, logout } = useAuth();
  const {
    orders, loading, loadOrders, saveOrder, advanceOrder, revertOrder, deleteOrder,
    moveToStage, bulkDelete, bulkMoveToStage, bulkSetCategory, bulkSetDepartment, bulkArchive,
    archiveOrder, unarchiveOrder, showArchived, setShowArchived,
  } = useOrders();
  const { settings, loadSettings, saveSettings } = useSettings();
  const { toasts, toast, removeToast } = useToast();
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [view, setView] = useState("pipeline"); // pipeline | list | audit | dashboard
  const [search, setSearch] = useState("");
  const [filterStale, setFilterStale] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [viewOrder, setViewOrder] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Advanced filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStages, setFilterStages] = useState(new Set());
  const [filterCreatedBy, setFilterCreatedBy] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");

  const searchRef = useRef(null);

  useEffect(() => {
    if (appState !== "app") return;
    loadOrders();
    loadSettings();
    api.get("/api/categories").then(c => c && setCategories(c));
    api.get("/api/departments").then(d => d && setDepartments(d));
  }, [appState]);

  // Clear selection when exiting selection mode
  useEffect(() => {
    if (!selectionMode) setSelectedIds(new Set());
  }, [selectionMode]);

  // Get unique creators for filter panel (must be before early returns per Rules of Hooks)
  const uniqueCreators = useMemo(() => {
    const creators = new Set(orders.map(o => o.created_by).filter(Boolean));
    return [...creators].sort();
  }, [orders]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Don't trigger when typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setEditOrder(null);
        setShowForm(true);
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (appState === "loading") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...S.mono, color: "var(--text-muted)" }}>
      Loading...
    </div>
  );
  if (appState === "setup") return <SetupPage onComplete={() => setAppState("login")} />;
  if (appState === "login") return <LoginPage onLogin={login} />;

  // Full-page views
  if (view === "audit") {
    return (
      <div style={{ minHeight: "100vh" }}>
        <AuditLogPage onBack={() => setView("pipeline")} />
      </div>
    );
  }

  if (view === "dashboard") {
    return (
      <div style={{ minHeight: "100vh" }}>
        <DashboardPage onBack={() => setView("pipeline")} />
      </div>
    );
  }

  const staleDays = parseInt(settings.stale_days) || 5;

  const filtered = orders.filter(o => {
    if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && o.category !== categoryFilter) return false;
    if (filterStale) {
      const stage = getCurrentStage(o);
      if (stage === STAGES.length - 1) return false;
      if (daysSince(o.last_updated || o.date) < staleDays) return false;
    }
    // Advanced filters
    if (filterDateFrom && o.date < filterDateFrom) return false;
    if (filterDateTo && o.date > filterDateTo) return false;
    if (filterStages.size > 0) {
      const stage = getCurrentStage(o);
      if (!filterStages.has(stage)) return false;
    }
    if (filterCreatedBy && o.created_by !== filterCreatedBy) return false;
    if (filterDepartment && o.department !== filterDepartment) return false;
    return true;
  });

  const totalActive = orders.filter(o => !DELIVERED_STATUSES.has(o.status)).length;
  const totalStale = orders.filter(o => {
    const stage = getCurrentStage(o);
    return stage < STAGES.length - 1 && daysSince(o.last_updated || o.date) >= staleDays;
  }).length;
  const totalDelivered = orders.filter(o => DELIVERED_STATUSES.has(o.status)).length;

  const handleEdit = (o) => { setEditOrder(o); setPrefill(null); setShowForm(true); };
  // Reorder: open a fresh order form pre-filled from a past order (new order, not an edit).
  const handleReorder = (o) => {
    setEditOrder(null);
    setPrefill({
      name: o.name, link: o.link, image_url: o.image_url, quantity: o.quantity,
      unit_cost: o.unit_cost, category: o.category, department: o.department,
      vendor: o.vendor, requested_by: o.requested_by, notes: o.notes,
    });
    setShowForm(true);
  };
  const handleView = (o) => { setViewOrder(o); };

  const handleSave = async (order) => {
    const ok = await saveOrder(order);
    if (ok) toast(order.id ? "Order updated" : "Order created", "success");
  };

  const handleDelete = async (id) => {
    await deleteOrder(id);
    toast("Order deleted", "success");
  };

  const handleArchive = async (id) => {
    const res = await archiveOrder(id);
    if (res?.success) toast("Order archived", "success");
  };

  const handleUnarchive = async (id) => {
    const res = await unarchiveOrder(id);
    if (res?.success) toast("Order unarchived", "success");
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map(o => o.id)));
  };

  const handleSelectAll = (ids) => {
    if (ids && ids.length === 0) {
      setSelectedIds(new Set());
    } else {
      selectAllFiltered();
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} order${selectedIds.size > 1 ? 's' : ''}?`)) return;
    await bulkDelete([...selectedIds]);
    toast(`Deleted ${selectedIds.size} orders`, "success");
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleBulkMove = async (targetStageIndex) => {
    if (selectedIds.size === 0) return;
    const stageName = STAGES[targetStageIndex]?.label || "Unknown";
    const res = await bulkMoveToStage([...selectedIds], targetStageIndex);
    if (res?.success) {
      toast(`Moved ${res.moved} orders to ${stageName}`, "success");
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
  };

  const handleBulkSetCategory = async (category) => {
    if (selectedIds.size === 0) return;
    const res = await bulkSetCategory([...selectedIds], category);
    if (res?.success) {
      toast(`Set category on ${res.updated} orders`, "success");
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
  };

  const handleBulkSetDepartment = async (department) => {
    if (selectedIds.size === 0) return;
    const res = await bulkSetDepartment([...selectedIds], department);
    if (res?.success) {
      toast(`Set department on ${res.updated} orders`, "success");
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Archive ${selectedIds.size} order${selectedIds.size > 1 ? 's' : ''}?`)) return;
    const res = await bulkArchive([...selectedIds]);
    if (res?.success) {
      toast(`Archived ${res.archived} orders`, "success");
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header
        totalActive={totalActive} totalStale={totalStale} totalDelivered={totalDelivered}
        search={search} setSearch={setSearch}
        filterStale={filterStale} setFilterStale={setFilterStale}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
        categories={categories}
        view={view} setView={setView}
        onSettings={() => setShowSettings(true)}
        onNewOrder={() => { setEditOrder(null); setShowForm(true); }}
        onImport={() => setShowImport(true)}
        onExport={() => window.open("/api/orders/export", "_blank")}
        onAuditLog={() => setView("audit")}
        onDashboard={() => setView("dashboard")}
        onLogout={logout}
        isAdmin={user?.role === "admin"}
        selectionMode={selectionMode}
        setSelectionMode={setSelectionMode}
        selectedCount={selectedIds.size}
        onDeleteSelected={handleDeleteSelected}
        onSelectAll={selectAllFiltered}
        onBulkMove={handleBulkMove}
        onBulkSetCategory={handleBulkSetCategory}
        onBulkSetDepartment={handleBulkSetDepartment}
        onBulkArchive={handleBulkArchive}
        departments={departments}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
        onLoadOrders={loadOrders}
        searchRef={searchRef}
      />

      {showFilters && (
        <FilterPanel
          dateFrom={filterDateFrom} dateTo={filterDateTo}
          setDateFrom={setFilterDateFrom} setDateTo={setFilterDateTo}
          filterStages={filterStages} setFilterStages={setFilterStages}
          filterCreatedBy={filterCreatedBy} setFilterCreatedBy={setFilterCreatedBy}
          users={uniqueCreators}
          filterDepartment={filterDepartment} setFilterDepartment={setFilterDepartment}
          departments={departments}
        />
      )}

      {loading && (view === "pipeline" || view === "list") && <SkeletonBoard />}

      {!loading && view === "pipeline" && (
        <PipelineView filtered={filtered} settings={settings}
          onAdvance={advanceOrder} onRevert={revertOrder} onDelete={handleDelete}
          onEdit={handleEdit} onView={handleView} onMoveToStage={moveToStage}
          selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
      )}

      {!loading && view === "list" && (
        <ListView filtered={filtered} settings={settings}
          onAdvance={advanceOrder} onRevert={revertOrder} onEdit={handleEdit} onView={handleView}
          selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={toggleSelect}
          onSelectAll={handleSelectAll} />
      )}

      {!loading && orders.length === 0 && <EmptyState />}

      {showForm && <OrderFormModal editOrder={editOrder} prefill={prefill} settings={settings} categories={categories} departments={departments}
        onSave={handleSave} toast={toast} onClose={() => { setShowForm(false); setEditOrder(null); setPrefill(null); }} />}

      {viewOrder && <OrderDetailModal order={viewOrder} settings={settings} user={user}
        onAdvance={advanceOrder} onRevert={revertOrder} onDelete={handleDelete}
        onEdit={handleEdit} onArchive={handleArchive} onUnarchive={handleUnarchive}
        onReorder={handleReorder} onRefresh={loadOrders} toast={toast}
        onClose={() => setViewOrder(null)} />}

      {showSettings && <SettingsModal settings={settings} user={user} categories={categories} departments={departments}
        onSave={saveSettings} onCategoriesChange={setCategories} onDepartmentsChange={setDepartments}
        onClose={() => setShowSettings(false)} />}
      {showImport && <ImportModal onImport={loadOrders} onClose={() => setShowImport(false)} />}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
