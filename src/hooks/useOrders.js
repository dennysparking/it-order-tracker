import { useState, useCallback } from 'react';
import { api } from '../api';
import { STAGES } from '../constants';
import { getCurrentStage } from '../utils';

export function useOrders() {
  const [orders, setOrders] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true); // true until the first load resolves

  const loadOrders = useCallback(async (includeArchived) => {
    const flag = includeArchived ?? false;
    try {
      const o = await api.get(`/api/orders${flag ? "?include_archived=1" : ""}`);
      if (o) setOrders(o);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveOrder = useCallback(async (order) => {
    if (order.id) {
      const res = await api.put(`/api/orders/${order.id}`, order);
      if (res) setOrders(prev => prev.map(o => o.id === res.id ? res : o));
      return !!res;
    } else {
      const res = await api.post("/api/orders", order);
      if (res) setOrders(prev => [res, ...prev]);
      return !!res;
    }
  }, []);

  const advanceOrder = useCallback(async (id) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const stage = getCurrentStage(order);
    if (stage >= STAGES.length - 1) return;
    const updated = { ...order, status: STAGES[stage + 1].key };
    const res = await api.put(`/api/orders/${id}`, updated);
    if (res) setOrders(prev => prev.map(o => o.id === id ? res : o));
  }, [orders]);

  const revertOrder = useCallback(async (id) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const stage = getCurrentStage(order);
    if (stage <= 0) return;
    const updated = { ...order, status: STAGES[stage - 1].key };
    const res = await api.put(`/api/orders/${id}`, updated);
    if (res) setOrders(prev => prev.map(o => o.id === id ? res : o));
  }, [orders]);

  const deleteOrder = useCallback(async (id) => {
    await api.del(`/api/orders/${id}`);
    setOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  const moveToStage = useCallback(async (id, targetStageIndex) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    if (getCurrentStage(order) === targetStageIndex) return;
    const updated = { ...order, status: STAGES[targetStageIndex]?.key || "sent_to_purchaser" };
    const res = await api.put(`/api/orders/${id}`, updated);
    if (res) setOrders(prev => prev.map(o => o.id === id ? res : o));
  }, [orders]);

  const bulkDelete = useCallback(async (ids) => {
    const res = await api.post("/api/orders/bulk-delete", { ids });
    if (res?.success) {
      setOrders(prev => prev.filter(o => !ids.includes(o.id)));
    }
    return res;
  }, []);

  const bulkMoveToStage = useCallback(async (ids, targetStageIndex) => {
    const res = await api.post("/api/orders/bulk-move", { ids, targetStageIndex });
    if (res?.success) {
      // Reload to get updated state
      const o = await api.get("/api/orders");
      if (o) setOrders(o);
    }
    return res;
  }, []);

  const bulkSetCategory = useCallback(async (ids, category) => {
    const res = await api.post("/api/orders/bulk-set-category", { ids, category });
    if (res?.success) {
      setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, category: category || null } : o));
    }
    return res;
  }, []);

  const bulkSetDepartment = useCallback(async (ids, department) => {
    const res = await api.post("/api/orders/bulk-set-department", { ids, department });
    if (res?.success) {
      setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, department: department || null } : o));
    }
    return res;
  }, []);

  const bulkArchive = useCallback(async (ids) => {
    const res = await api.post("/api/orders/bulk-archive", { ids });
    if (res?.success) {
      setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, archived: 1 } : o));
    }
    return res;
  }, []);

  const archiveOrder = useCallback(async (id) => {
    const res = await api.post(`/api/orders/${id}/archive`);
    if (res?.success) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, archived: 1 } : o));
    }
    return res;
  }, []);

  const unarchiveOrder = useCallback(async (id) => {
    const res = await api.post(`/api/orders/${id}/unarchive`);
    if (res?.success) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, archived: 0 } : o));
    }
    return res;
  }, []);

  return {
    orders, loading, loadOrders, saveOrder, advanceOrder, revertOrder, deleteOrder,
    moveToStage, bulkDelete, bulkMoveToStage, bulkSetCategory, bulkSetDepartment, bulkArchive,
    archiveOrder, unarchiveOrder, showArchived, setShowArchived,
  };
}
