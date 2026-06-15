import { useState, useCallback, useRef } from 'react';
import { api } from '../api';
import { S } from '../styles';
import { buildMailtoLink } from '../utils';

export default function OrderFormModal({ editOrder, settings, categories = [], departments = [], onSave, onClose }) {
  const [name, setName] = useState(editOrder?.name || "");
  const [link, setLink] = useState(editOrder?.link || "");
  const [imageUrl, setImageUrl] = useState(editOrder?.image_url || "");
  const [quantity, setQuantity] = useState(editOrder?.quantity || 1);
  const [unitCost, setUnitCost] = useState(editOrder?.unit_cost ?? "");
  const [category, setCategory] = useState(editOrder?.category || "");
  const [department, setDepartment] = useState(editOrder?.department || "");
  const [vendor, setVendor] = useState(editOrder?.vendor || "");
  const [requestedBy, setRequestedBy] = useState(editOrder?.requested_by || "");
  const [notes, setNotes] = useState(editOrder?.notes || "");

  const TO_RECIPIENTS = [
    { name: "Tami",    email: "Tami.Hockemeyer@copperworks.com" },
    { name: "Desiree", email: "Desiree.Elett@copperworks.com" },
    { name: "Stacey",  email: "Stacey.Garton@copperworks.com" },
  ];
  const CC_RECIPIENTS = [
    { name: "Nick",   email: "Nick.Kemerley@copperworks.com" },
    { name: "Daniel", email: "Daniel.Estrada@copperworks.com" },
    { name: "Rob",    email: "robert.vinzant@copperworks.com" },
    { name: "Dennis", email: "Dennis.Ratliff@copperworks.com" },
  ];

  const parseNames = (val, pool) => {
    if (!val) return { known: [], other: "" };
    const parts = val.split(",").map(s => s.trim()).filter(Boolean);
    const poolNames = pool.map(p => p.name);
    return {
      known: parts.filter(p => poolNames.includes(p)),
      other: parts.filter(p => !poolNames.includes(p)).join(", "),
    };
  };

  const initTo = parseNames(editOrder?.recipients || "", TO_RECIPIENTS);
  const initCc = parseNames(editOrder?.cc_recipients || "", CC_RECIPIENTS);

  const [selectedTo, setSelectedTo] = useState(initTo.known);
  const [otherChecked, setOtherChecked] = useState(!!initTo.other);
  const [otherRecipient, setOtherRecipient] = useState(initTo.other);
  const [selectedCc, setSelectedCc] = useState(initCc.known);
  const [otherCcChecked, setOtherCcChecked] = useState(!!initCc.other);
  const [otherCcRecipient, setOtherCcRecipient] = useState(initCc.other);

  const toggleTo = (name) => setSelectedTo(prev => prev.includes(name) ? prev.filter(r => r !== name) : [...prev, name]);
  const toggleCc = (name) => setSelectedCc(prev => prev.includes(name) ? prev.filter(r => r !== name) : [...prev, name]);

  const buildNames = (sel, otherCk, otherTxt) => {
    const parts = [...sel];
    if (otherCk && otherTxt.trim()) parts.push(otherTxt.trim());
    return parts.join(", ");
  };
  const [date, setDate] = useState(editOrder?.date || new Date().toISOString().slice(0, 10));
  const [isBulk, setIsBulk] = useState(editOrder?.is_bulk || false);
  const [bulkItems, setBulkItems] = useState([{ name: "", link: "", quantity: 1, unit_cost: "" }]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewBlocked, setPreviewBlocked] = useState(false);
  const linkTimer = useRef(null);

  const addBulkItem = () => setBulkItems(prev => [...prev, { name: "", link: "", quantity: 1, unit_cost: "" }]);
  const removeBulkItem = (i) => setBulkItems(prev => prev.filter((_, idx) => idx !== i));
  const updateBulkItem = (i, field, val) => setBulkItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const fetchPreview = useCallback((url) => {
    if (!url || url.length < 10) return;
    setPreviewLoading(true);
    setPreviewBlocked(false);
    api.get(`/api/preview?url=${encodeURIComponent(url)}`).then(res => {
      setPreviewLoading(false);
      if (res?.image) setImageUrl(res.image);
      if (res?.title && !name) setName(res.title.slice(0, 120));
      if (res?.price && unitCost === "") setUnitCost(res.price);
      if (res?.vendor) setVendor(prev => prev || res.vendor);
      // Site blocked automated fetch (e.g. Cloudflare on SHI) and we got no image/price.
      if (res?.blocked && !res?.image && res?.price == null) setPreviewBlocked(true);
    }).catch(() => setPreviewLoading(false));
  }, [name]);

  const handleLinkChange = (val) => {
    setLink(val);
    clearTimeout(linkTimer.current);
    linkTimer.current = setTimeout(() => fetchPreview(val), 800);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const confirmToken = editOrder?.confirm_token || (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
    const confirmLink = `${window.location.origin}/confirm/${confirmToken}`;
    const order = {
      ...(editOrder || {}),
      name: name.trim(), link: link.trim(), image_url: imageUrl,
      quantity: parseInt(quantity) || 1, notes: notes.trim(), date, category: category || null,
      unit_cost: unitCost !== "" ? parseFloat(unitCost) : null,
      department: department || null, requested_by: requestedBy.trim() || null,
      vendor: vendor.trim() || null,
      recipients: buildNames(selectedTo, otherChecked, otherRecipient) || null,
      cc_recipients: buildNames(selectedCc, otherCcChecked, otherCcRecipient) || null,
      confirm_token: confirmToken,
      is_bulk: isBulk ? 1 : 0,
      bulk_items: isBulk ? bulkItems.filter(it => it.name.trim()).map(it => ({
        name: it.name.trim(), link: it.link.trim(), quantity: parseInt(it.quantity) || 1,
        unit_cost: it.unit_cost !== "" ? parseFloat(it.unit_cost) : null,
      })) : [],
    };

    if (!editOrder) {
      order.status = "sent_to_purchaser";
      const toEmails = selectedTo.map(n => TO_RECIPIENTS.find(r => r.name === n)?.email).filter(Boolean);
      if (otherChecked && otherRecipient.trim()) toEmails.push(otherRecipient.trim());
      const ccEmails = selectedCc.map(n => CC_RECIPIENTS.find(r => r.name === n)?.email).filter(Boolean);
      if (otherCcChecked && otherCcRecipient.trim()) ccEmails.push(otherCcRecipient.trim());
      const mailto = buildMailtoLink(order, toEmails.join(";"), settings.email_template_subject, settings.email_template_body, ccEmails, confirmLink);
      const a = document.createElement("a");
      a.href = mailto;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    onSave(order);
    onClose();
  };

  return (
    <div style={S.modal} onClick={onClose}>
      <div className="modal-box" style={S.modalBox} onClick={e => e.stopPropagation()}>
        <h2 style={{ ...S.mono, fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
          {editOrder ? "Edit Order" : "New Order"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Item Link / URL</label>
            <input style={S.input} value={link} onChange={e => handleLinkChange(e.target.value)}
              placeholder="Paste Amazon or product URL..." autoFocus />
            {previewLoading && <span style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6, display: "flex", alignItems: "center", gap: 7 }}><span className="spinner" /> Fetching details…</span>}
            {!previewLoading && previewBlocked && (
              <span style={{ ...S.mono, fontSize: 10, color: "#f59e0b", marginTop: 4, display: "block" }}>
                This site blocks automatic preview — please add the image and price manually.
              </span>
            )}
          </div>

          {(imageUrl || previewLoading) && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {imageUrl && <img src={imageUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", background: "#fff" }}
                onError={() => setImageUrl("")} />}
              <div style={{ flex: 1 }}>
                <label style={S.label}>Image URL (auto-detected)</label>
                <input style={{ ...S.input, fontSize: 12 }} value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  placeholder="Override image URL if needed" />
              </div>
            </div>
          )}

          <div>
            <label style={S.label}>Item Name *</label>
            <input style={S.input} value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Laptop Cart, Monitor Stand" />
          </div>

          <div>
            <label style={S.label}>Vendor</label>
            <input style={S.input} value={vendor} onChange={e => setVendor(e.target.value)}
              placeholder="e.g. Amazon, CDW, Dell (auto-detected from link)" />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Date</label>
              <input style={{ ...S.input, colorScheme: "dark" }} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div style={{ width: 100 }}>
              <label style={S.label}>Quantity</label>
              <input style={{ ...S.input, textAlign: "center" }} type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div style={{ width: 120 }}>
              <label style={S.label}>Unit Cost ($)</label>
              <input style={{ ...S.input, textAlign: "right" }} type="number" min="0" step="0.01" value={unitCost}
                onChange={e => setUnitCost(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          {categories.length > 0 && (
            <div>
              <label style={S.label}>Category</label>
              <select style={S.input} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">None</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {departments.length > 0 && (
            <div>
              <label style={S.label}>Department</label>
              <select style={S.input} value={department} onChange={e => setDepartment(e.target.value)}>
                <option value="">None</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={S.label}>Requested By</label>
            <input style={S.input} value={requestedBy} onChange={e => setRequestedBy(e.target.value)}
              placeholder="Person who requested this item" />
          </div>

          <div>
            <label style={S.label}>Send To</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
              {TO_RECIPIENTS.map(r => (
                <label key={r.name} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={selectedTo.includes(r.name)} onChange={() => toggleTo(r.name)}
                    style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                  {r.name}
                </label>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={otherChecked} onChange={e => { setOtherChecked(e.target.checked); if (!e.target.checked) setOtherRecipient(""); }}
                  style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                Other
              </label>
            </div>
            {otherChecked && (
              <input style={{ ...S.input, marginTop: 8 }} value={otherRecipient} onChange={e => setOtherRecipient(e.target.value)}
                placeholder="Enter email address..." />
            )}
          </div>

          <div>
            <label style={S.label}>CC</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
              {CC_RECIPIENTS.map(r => (
                <label key={r.name} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                  <input type="checkbox" checked={selectedCc.includes(r.name)} onChange={() => toggleCc(r.name)}
                    style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                  {r.name}
                </label>
              ))}
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={otherCcChecked} onChange={e => { setOtherCcChecked(e.target.checked); if (!e.target.checked) setOtherCcRecipient(""); }}
                  style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                Other
              </label>
            </div>
            {otherCcChecked && (
              <input style={{ ...S.input, marginTop: 8 }} value={otherCcRecipient} onChange={e => setOtherCcRecipient(e.target.value)}
                placeholder="Enter email address..." />
            )}
          </div>

          <div>
            <label style={S.label}>Notes</label>
            <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..." />
          </div>

          {!editOrder && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={isBulk} onChange={e => setIsBulk(e.target.checked)}
                style={{ accentColor: "var(--accent)", width: 16, height: 16 }} />
              This is a bulk/multi-item order
            </label>
          )}

          {isBulk && (
            <div style={{ border: "1px solid var(--border-primary)", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <label style={{ ...S.mono, fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Sub-Items</label>
                <button type="button" onClick={addBulkItem} style={{ ...S.mono, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>+ Add Item</button>
              </div>
              {bulkItems.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 2 }}>
                    <input style={{ ...S.input, fontSize: 12 }} value={item.name} onChange={e => updateBulkItem(i, "name", e.target.value)} placeholder="Item name *" />
                  </div>
                  <div style={{ flex: 2 }}>
                    <input style={{ ...S.input, fontSize: 12 }} value={item.link} onChange={e => updateBulkItem(i, "link", e.target.value)} placeholder="URL (optional)" />
                  </div>
                  <div style={{ width: 60 }}>
                    <input style={{ ...S.input, textAlign: "center", fontSize: 12 }} type="number" min="1" value={item.quantity} onChange={e => updateBulkItem(i, "quantity", e.target.value)} placeholder="Qty" />
                  </div>
                  <div style={{ width: 80 }}>
                    <input style={{ ...S.input, textAlign: "right", fontSize: 12 }} type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => updateBulkItem(i, "unit_cost", e.target.value)} placeholder="Cost" />
                  </div>
                  {bulkItems.length > 1 && (
                    <button type="button" onClick={() => removeBulkItem(i)} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16, padding: "6px 2px", lineHeight: 1 }}>×</button>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={handleSave} style={S.btnPrimary}>
            {editOrder ? "Save Changes" : "Create & Send \u2709"}
          </button>
        </div>
      </div>
    </div>
  );
}
