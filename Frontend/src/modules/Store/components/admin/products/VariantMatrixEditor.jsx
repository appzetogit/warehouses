import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Trash2, Wand2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { catalogAPI, uploadAPI } from "@store/api"

/**
 * Variant matrix editor for the admin product form.
 *
 * Options come from the category's attribute set (its own, else its parent's).
 * Without a set the admin can type options freely. "Generate" builds every
 * combination of the picked values; rows that already exist keep their data.
 *
 * Draft shape (strings for inputs, converted by toVariantPayload):
 * { id, name, attributes: [{ name, value }], sku, barcode, price, otherPrice, mrp,
 *   stockQty, lowStockThreshold, isActive, images: [url] }
 */

const newId = () => `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const str = (v) => (v === null || v === undefined ? "" : String(v))

export const createVariantDraft = (variant = {}) => ({
  id: String(variant?.id || variant?._id || newId()),
  name: str(variant?.name),
  attributes: Array.isArray(variant?.attributes)
    ? variant.attributes.map((a) => ({ name: str(a?.name), value: str(a?.value) })).filter((a) => a.name && a.value)
    : [],
  sku: str(variant?.sku),
  barcode: str(variant?.barcode),
  price: variant?.price != null ? String(variant.price) : "",
  otherPrice: variant?.otherPrice ? String(variant.otherPrice) : "",
  mrp: str(variant?.mrp),
  stockQty: str(variant?.stockQty),
  lowStockThreshold: str(variant?.lowStockThreshold),
  isActive: variant?.isActive !== false,
  images: Array.isArray(variant?.images) ? variant.images.filter(Boolean) : [],
})

const attributeKey = (attributes = []) =>
  attributes
    .map((a) => `${a.name.toLowerCase()}=${a.value.toLowerCase()}`)
    .sort()
    .join("|")

const optionalNumber = (v) => (str(v).trim() === "" ? null : Number(v))

/** Validates drafts and returns [error, payload] in the shape the product endpoints accept. */
export const toVariantPayload = (drafts = []) => {
  const rows = drafts.filter(
    (d) => d.attributes?.length || str(d.name).trim() || str(d.price).trim() || !String(d.id).startsWith("variant-"),
  )
  const seen = new Set()
  const out = []
  for (const d of rows) {
    const name = str(d.name).trim() || d.attributes.map((a) => a.value).join(" / ")
    if (!name) return ["Each variant needs a name or options", null]
    const price = Number(d.price)
    if (!Number.isFinite(price) || price <= 0) return [`Price for ${name} must be greater than 0`, null]
    const mrp = optionalNumber(d.mrp)
    if (mrp !== null && (!Number.isFinite(mrp) || mrp <= 0)) return [`MRP for ${name} is invalid`, null]
    if (mrp !== null && price > mrp) return [`Price of ${name} cannot be above its MRP`, null]
    const stockQty = optionalNumber(d.stockQty)
    const lowStockThreshold = optionalNumber(d.lowStockThreshold)
    for (const [label, n] of [["Stock", stockQty], ["Low-stock alert", lowStockThreshold]]) {
      if (n !== null && !(Number.isInteger(n) && n >= 0)) return [`${label} for ${name} must be a whole number of 0 or more`, null]
    }
    if (d.attributes.length) {
      const key = attributeKey(d.attributes)
      if (seen.has(key)) return [`Two variants have the same options: ${name}`, null]
      seen.add(key)
    }
    const otherPrice = Number(d.otherPrice) || 0
    out.push({
      ...(!String(d.id).startsWith("variant-") ? { _id: d.id } : {}),
      name,
      price,
      otherPrice: otherPrice > 0 ? otherPrice : 0,
      attributes: d.attributes,
      sku: str(d.sku).trim(),
      barcode: str(d.barcode).trim(),
      mrp,
      stockQty,
      lowStockThreshold,
      isActive: d.isActive !== false,
      images: (d.images || []).map((u) => str(u).trim()).filter(Boolean).slice(0, 10),
    })
  }
  return [null, out]
}

const cartesian = (lists) =>
  lists.reduce((acc, list) => acc.flatMap((combo) => list.map((item) => [...combo, item])), [[]])

const inputCls =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-slate-900 bg-white"

export default function VariantMatrixEditor({ categoryId, variants = [], onChange }) {
  const [attrLoading, setAttrLoading] = useState(false)
  const [attributeSet, setAttributeSet] = useState(null)
  const [setAttributes, setSetAttributes] = useState([])
  // { [attributeName]: Set of picked values } for set-based options.
  const [picked, setPicked] = useState({})
  // Free-form options when the category has no attribute set: [{ name, values: "S, M, L" }].
  const [freeOptions, setFreeOptions] = useState([{ name: "", values: "" }])
  const [defaults, setDefaults] = useState({ price: "", mrp: "", stockQty: "", lowStockThreshold: "" })
  const [uploadingId, setUploadingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setAttributeSet(null)
    setSetAttributes([])
    if (!categoryId) return undefined
    setAttrLoading(true)
    catalogAPI
      .getCategoryAttributes(categoryId)
      .then((res) => {
        if (cancelled) return
        const data = res?.data?.data || {}
        setAttributeSet(data.attributeSet || null)
        setSetAttributes(Array.isArray(data.attributes) ? data.attributes : [])
      })
      .catch(() => {
        if (!cancelled) setSetAttributes([])
      })
      .finally(() => {
        if (!cancelled) setAttrLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [categoryId])

  // Pre-select the values the existing variants already use.
  useEffect(() => {
    const next = {}
    for (const v of variants) {
      for (const a of v.attributes || []) {
        next[a.name] = next[a.name] || new Set()
        next[a.name].add(a.value)
      }
    }
    setPicked((prev) => (Object.keys(prev).length ? prev : next))
    if (!setAttributes.length && Object.keys(next).length) {
      setFreeOptions((prev) =>
        prev.some((o) => o.name.trim())
          ? prev
          : Object.entries(next).map(([name, values]) => ({ name, values: [...values].join(", ") })),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAttributes])

  const optionLists = useMemo(() => {
    if (setAttributes.length) {
      return setAttributes
        .map((a) => ({
          name: a.name,
          values: (a.values || []).map((v) => v.value).filter((v) => picked[a.name]?.has(v)),
        }))
        .filter((o) => o.values.length)
    }
    return freeOptions
      .map((o) => ({
        name: o.name.trim(),
        values: [...new Set(o.values.split(",").map((v) => v.trim()).filter(Boolean))],
      }))
      .filter((o) => o.name && o.values.length)
  }, [setAttributes, picked, freeOptions])

  const combinationCount = optionLists.length ? optionLists.reduce((n, o) => n * o.values.length, 1) : 0

  const togglePick = (name, value) => {
    setPicked((prev) => {
      const set = new Set(prev[name] || [])
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...prev, [name]: set }
    })
  }

  const generate = () => {
    if (!optionLists.length) {
      toast.error("Pick at least one value for an option first")
      return
    }
    if (combinationCount > 200) {
      toast.error("That is more than 200 combinations. Pick fewer values.")
      return
    }
    const existing = new Map(variants.filter((v) => v.attributes?.length).map((v) => [attributeKey(v.attributes), v]))
    const combos = cartesian(optionLists.map((o) => o.values.map((value) => ({ name: o.name, value }))))
    const next = combos.map((attributes) => {
      const found = existing.get(attributeKey(attributes))
      if (found) return { ...found, attributes }
      return createVariantDraft({
        attributes,
        price: defaults.price || undefined,
        mrp: defaults.mrp,
        stockQty: defaults.stockQty,
        lowStockThreshold: defaults.lowStockThreshold,
      })
    })
    const manual = variants.filter((v) => !v.attributes?.length)
    const dropped = variants.length - manual.length - next.filter((v) => existing.has(attributeKey(v.attributes))).length
    onChange([...next, ...manual])
    toast.success(
      `${combos.length} combination${combos.length === 1 ? "" : "s"} ready${dropped > 0 ? `, ${dropped} old one${dropped === 1 ? "" : "s"} removed` : ""}`,
    )
  }

  const update = (id, field, value) => onChange(variants.map((v) => (v.id === id ? { ...v, [field]: value } : v)))
  const remove = (id) => onChange(variants.filter((v) => v.id !== id))
  const addManual = () => onChange([...variants, createVariantDraft()])
  const applyDefaultsToAll = () =>
    onChange(
      variants.map((v) => ({
        ...v,
        ...(defaults.price !== "" ? { price: defaults.price } : {}),
        ...(defaults.mrp !== "" ? { mrp: defaults.mrp } : {}),
        ...(defaults.stockQty !== "" ? { stockQty: defaults.stockQty } : {}),
        ...(defaults.lowStockThreshold !== "" ? { lowStockThreshold: defaults.lowStockThreshold } : {}),
      })),
    )

  const uploadImages = async (id, files) => {
    const list = Array.from(files || [])
    if (!list.length) return
    setUploadingId(id)
    try {
      const urls = await Promise.all(
        list.map(async (file) => {
          const res = await uploadAPI.uploadMedia(file, { folder: "products" })
          return res?.data?.data?.url || res?.data?.url || ""
        }),
      )
      const current = variants.find((v) => v.id === id)?.images || []
      update(id, "images", [...current, ...urls.filter(Boolean)].slice(0, 10))
    } catch (err) {
      toast.error(err?.response?.data?.message || "Image upload failed")
    } finally {
      setUploadingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Variants</p>
          <p className="text-xs text-slate-500">
            {attrLoading
              ? "Loading category options..."
              : attributeSet
                ? `Options from attribute set "${attributeSet.name}".`
                : categoryId
                  ? "This category has no attribute set, so options are free text."
                  : "Pick a category to use its attribute set, or type options below."}
          </p>
        </div>
        <button
          type="button"
          onClick={addManual}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Add single variant
        </button>
      </div>

      {/* Options */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        {attrLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
        ) : setAttributes.length ? (
          setAttributes.map((attr) => (
            <div key={attr._id || attr.name}>
              <p className="mb-1 text-xs font-semibold text-slate-700">{attr.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {(attr.values || []).map((v) => {
                  const on = picked[attr.name]?.has(v.value)
                  return (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => togglePick(attr.name, v.value)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                        on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {v.hex ? <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: v.hex }} /> : null}
                      {v.value}
                    </button>
                  )
                })}
                {!(attr.values || []).length && <span className="text-xs text-slate-400">No values listed</span>}
              </div>
            </div>
          ))
        ) : (
          <div className="space-y-2">
            {freeOptions.map((opt, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_auto] gap-2">
                <input
                  className={inputCls}
                  placeholder="Option (e.g. Size)"
                  value={opt.name}
                  onChange={(e) =>
                    setFreeOptions((prev) => prev.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))
                  }
                />
                <input
                  className={inputCls}
                  placeholder="Values, comma separated (e.g. S, M, L)"
                  value={opt.values}
                  onChange={(e) =>
                    setFreeOptions((prev) => prev.map((o, j) => (j === i ? { ...o, values: e.target.value } : o)))
                  }
                />
                <button
                  type="button"
                  onClick={() => setFreeOptions((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ name: "", values: "" }]))}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Remove option"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFreeOptions((prev) => [...prev, { name: "", values: "" }])}
              className="text-xs font-semibold text-blue-600"
            >
              + Add option
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["price", "Default price"],
            ["mrp", "Default MRP"],
            ["stockQty", "Default stock"],
            ["lowStockThreshold", "Default low-stock alert"],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">{label}</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={defaults[key]}
                onChange={(e) => setDefaults((d) => ({ ...d, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={!combinationCount}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Generate {combinationCount ? `${combinationCount} combination${combinationCount === 1 ? "" : "s"}` : "combinations"}
          </button>
          {variants.length > 0 && (
            <button
              type="button"
              onClick={applyDefaultsToAll}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Apply defaults to all rows
            </button>
          )}
        </div>
      </div>

      {/* Matrix */}
      {variants.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left">Variant</th>
                <th className="px-2 py-2 text-left">SKU</th>
                <th className="px-2 py-2 text-left">Price *</th>
                <th className="px-2 py-2 text-left">MRP</th>
                <th className="px-2 py-2 text-left">Stock</th>
                <th className="px-2 py-2 text-left">Low alert</th>
                <th className="px-2 py-2 text-center">Active</th>
                <th className="px-2 py-2 text-left">Images</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {variants.map((v) => (
                <tr key={v.id} className={v.isActive ? "" : "bg-slate-50 text-slate-400"}>
                  <td className="px-2 py-2 align-top min-w-[150px]">
                    {v.attributes?.length ? (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {v.attributes.map((a) => (
                          <span key={a.name} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                            {a.name}: {a.value}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <input
                      className={inputCls}
                      placeholder={v.attributes?.length ? v.attributes.map((a) => a.value).join(" / ") : "Name (e.g. 500 g)"}
                      value={v.name}
                      onChange={(e) => update(v.id, "name", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 align-top w-28">
                    <input className={inputCls} value={v.sku} onChange={(e) => update(v.id, "sku", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 align-top w-24">
                    <input type="number" min="0" step="0.01" className={inputCls} value={v.price} onChange={(e) => update(v.id, "price", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 align-top w-24">
                    <input type="number" min="0" step="0.01" className={inputCls} value={v.mrp} onChange={(e) => update(v.id, "mrp", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 align-top w-20">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={inputCls}
                      placeholder="Shared"
                      title="Empty: draws on the product's stock"
                      value={v.stockQty}
                      onChange={(e) => update(v.id, "stockQty", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 align-top w-20">
                    <input type="number" min="0" step="1" className={inputCls} value={v.lowStockThreshold} onChange={(e) => update(v.id, "lowStockThreshold", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 align-top text-center">
                    <input type="checkbox" checked={v.isActive} onChange={(e) => update(v.id, "isActive", e.target.checked)} />
                  </td>
                  <td className="px-2 py-2 align-top min-w-[140px]">
                    <div className="flex flex-wrap items-center gap-1">
                      {(v.images || []).map((url) => (
                        <span key={url} className="relative">
                          <img src={url} alt="" className="h-8 w-8 rounded border object-cover" />
                          <button
                            type="button"
                            onClick={() => update(v.id, "images", v.images.filter((u) => u !== url))}
                            className="absolute -right-1 -top-1 rounded-full bg-white text-rose-600 shadow"
                            aria-label="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">
                        {uploadingId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          multiple
                          className="hidden"
                          disabled={uploadingId !== null}
                          onChange={(e) => {
                            uploadImages(v.id, e.target.files)
                            e.target.value = ""
                          }}
                        />
                      </label>
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => remove(v.id)}
                      className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                      aria-label="Remove variant"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-slate-500">
            Empty stock means the variant draws on the product&apos;s shared stock. Empty MRP falls back to the product&apos;s MRP.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No variants added. This product will use the single base price.</p>
      )}
    </div>
  )
}
