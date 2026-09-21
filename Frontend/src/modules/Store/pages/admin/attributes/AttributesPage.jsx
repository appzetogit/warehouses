import { useState, useEffect } from "react"
import { 
  FolderTree, 
  Layers, 
  Plus, 
  Trash2, 
  Tag, 
  Palette, 
  RefreshCw,
  Check,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import { attributeAdminAPI } from "@/services/api"
import { Button } from "@store/components/ui/button"
import { Input } from "@store/components/ui/input"

export default function AttributesPage() {
  const [activeTab, setActiveTab] = useState("attributes")
  const [loading, setLoading] = useState(false)

  // Data
  const [attributes, setAttributes] = useState([])
  const [attributeSets, setAttributeSets] = useState([])

  // Create Attribute Form Modal State
  const [newAttrName, setNewAttrName] = useState("")
  const [newAttrType, setNewAttrType] = useState("select")
  const [attrValuesText, setAttrValuesText] = useState("")
  const [creatingAttr, setCreatingAttr] = useState(false)

  // Create Attribute Set Form Modal State
  const [newSetName, setNewSetName] = useState("")
  const [selectedAttrIds, setSelectedAttrIds] = useState([])
  const [creatingSet, setCreatingSet] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [attrsRes, setsRes] = await Promise.all([
        attributeAdminAPI.listAttributes(),
        attributeAdminAPI.listSets(),
      ])
      setAttributes(attrsRes?.data?.data?.attributes || [])
      setAttributeSets(setsRes?.data?.data?.attributeSets || [])
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load attributes")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAttribute = async (e) => {
    e.preventDefault()
    if (!newAttrName.trim()) return toast.error("Attribute name is required")
    const values = attrValuesText
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)

    if (values.length === 0) {
      return toast.error("Please provide at least one comma-separated value")
    }

    try {
      setCreatingAttr(true)
      const payload = {
        name: newAttrName.trim(),
        type: newAttrType,
        values: newAttrType === "color" 
          ? values.map((v) => ({ value: v, hex: "#000000" })) 
          : values,
      }
      await attributeAdminAPI.createAttribute(payload)
      toast.success(`Attribute "${newAttrName}" created successfully!`)
      setNewAttrName("")
      setAttrValuesText("")
      fetchAll()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to create attribute")
    } finally {
      setCreatingAttr(false)
    }
  }

  const handleDeleteAttribute = async (id, name) => {
    if (!confirm(`Are you sure you want to delete attribute "${name}"?`)) return
    try {
      await attributeAdminAPI.deleteAttribute(id)
      toast.success(`Attribute "${name}" deleted`)
      fetchAll()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Cannot delete attribute in use")
    }
  }

  const handleCreateAttributeSet = async (e) => {
    e.preventDefault()
    if (!newSetName.trim()) return toast.error("Attribute Set name is required")
    if (selectedAttrIds.length === 0) return toast.error("Select at least one attribute for the set")

    try {
      setCreatingSet(true)
      await attributeAdminAPI.createSet({
        name: newSetName.trim(),
        attributeIds: selectedAttrIds,
      })
      toast.success(`Attribute Set "${newSetName}" created successfully!`)
      setNewSetName("")
      setSelectedAttrIds([])
      fetchAll()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to create attribute set")
    } finally {
      setCreatingSet(false)
    }
  }

  const handleDeleteAttributeSet = async (id, name) => {
    if (!confirm(`Are you sure you want to delete attribute set "${name}"?`)) return
    try {
      await attributeAdminAPI.deleteSet(id)
      toast.success(`Attribute set "${name}" deleted`)
      fetchAll()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Cannot delete attribute set in use")
    }
  }

  const toggleAttrInSet = (id) => {
    setSelectedAttrIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold uppercase tracking-wider mb-3">
              <FolderTree className="w-4 h-4 text-blue-200" /> Multi-Vendor Catalogue
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Attributes & Sets</h1>
            <p className="mt-2 text-white/90 text-sm max-w-2xl leading-relaxed">
              Define standard attributes (Size, Color, Material, RAM, Storage) and group them into
              Attribute Sets. Linking an Attribute Set to a Category enables sellers to generate rich variant matrices.
            </p>
          </div>

          <button
            onClick={fetchAll}
            className="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-sm font-semibold transition-all flex items-center gap-2 shadow-sm self-start"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 space-x-2">
        <button
          onClick={() => setActiveTab("attributes")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-t-xl transition-all border-b-2 -mb-[2px] ${
            activeTab === "attributes"
              ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <Tag className="w-4 h-4" /> Attributes ({attributes.length})
        </button>
        <button
          onClick={() => setActiveTab("sets")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-t-xl transition-all border-b-2 -mb-[2px] ${
            activeTab === "sets"
              ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <Layers className="w-4 h-4" /> Attribute Sets ({attributeSets.length})
        </button>
      </div>

      {/* TAB 1: ATTRIBUTES */}
      {activeTab === "attributes" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Creator Form */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm h-fit">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-600" /> New Attribute
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-5">
              Add an individual attribute with predefined values.
            </p>

            <form onSubmit={handleCreateAttribute} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Name</label>
                <Input
                  placeholder="e.g. Size, Color, Storage"
                  value={newAttrName}
                  onChange={(e) => setNewAttrName(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Display Type</label>
                <select
                  value={newAttrType}
                  onChange={(e) => setNewAttrType(e.target.value)}
                  className="mt-1 w-full p-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                >
                  <option value="select">Text Buttons / Chips (e.g. S, M, L)</option>
                  <option value="color">Color Swatches (with Hex codes)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Predefined Values (comma separated)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Small, Medium, Large, Extra Large"
                  value={attrValuesText}
                  onChange={(e) => setAttrValuesText(e.target.value)}
                  className="mt-1 w-full p-3 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={creatingAttr}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
              >
                {creatingAttr ? "Creating..." : "Save Attribute"}
              </Button>
            </form>
          </div>

          {/* List Table */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Configured Attributes</h3>

            {attributes.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                No attributes created yet. Add one using the form on the left.
              </div>
            ) : (
              <div className="space-y-3">
                {attributes.map((attr) => (
                  <div
                    key={attr._id}
                    className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-indigo-200 transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white text-sm">{attr.name}</span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600">
                          {attr.type}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {attr.values?.map((val, idx) => {
                          const label = typeof val === "object" ? val.value : val
                          return (
                            <span
                              key={idx}
                              className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium"
                            >
                              {label}
                            </span>
                          )
                        })}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteAttribute(attr._id, attr.name)}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Delete Attribute"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ATTRIBUTE SETS */}
      {activeTab === "sets" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Set Creator Form */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm h-fit">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-600" /> New Attribute Set
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-5">
              Bundle multiple attributes together for category assignment.
            </p>

            <form onSubmit={handleCreateAttributeSet} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Set Name</label>
                <Input
                  placeholder="e.g. Apparel Set, Electronics Specs"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                  Select Attributes to Bundle
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto border p-2 rounded-xl">
                  {attributes.map((attr) => {
                    const isSelected = selectedAttrIds.includes(attr._id)
                    return (
                      <button
                        type="button"
                        key={attr._id}
                        onClick={() => toggleAttrInSet(attr._id)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? "bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-200"
                            : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <span>{attr.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-purple-600" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Button
                type="submit"
                disabled={creatingSet}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl"
              >
                {creatingSet ? "Creating..." : "Save Attribute Set"}
              </Button>
            </form>
          </div>

          {/* Sets List Table */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Configured Attribute Sets</h3>

            {attributeSets.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                No attribute sets created yet. Bundle attributes using the form on the left.
              </div>
            ) : (
              <div className="space-y-3">
                {attributeSets.map((set) => (
                  <div
                    key={set._id}
                    className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-purple-200 transition-all flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">{set.name}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Contains {set.attributes?.length || 0} attributes
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {set.attributes?.map((attr) => (
                          <span
                            key={attr._id}
                            className="text-xs px-2.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium"
                          >
                            {attr.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteAttributeSet(set._id, set.name)}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Delete Set"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
