import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@store/api";

const errorMessage = (e, fallback) => e?.response?.data?.message || e?.message || fallback;

const SOURCE_LABEL = {
  admin: "the login saved here",
  env: "the server's .env file",
  none: "nothing yet",
};

/**
 * Shiprocket API login for Shop (courier) orders. The password is never sent
 * back: leave it blank to keep the saved one. Saves on its own button.
 */
export default function ShiprocketSettingsCard() {
  const [state, setState] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", pickupLocation: "", pickupPincode: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pickups, setPickups] = useState(null);

  const load = (data) => {
    setState(data);
    setForm({
      email: data?.shiprocket?.email || "",
      password: "",
      pickupLocation: data?.shiprocket?.pickupLocation || "",
      pickupPincode: data?.shiprocket?.pickupPincode || "",
    });
  };

  useEffect(() => {
    adminAPI
      .getShippingSettings()
      .then((res) => load(res?.data?.data || null))
      .catch((e) => toast.error(errorMessage(e, "Failed to load Shiprocket settings")));
  }, []);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const body = (extra = {}) => ({
    email: form.email.trim(),
    pickupLocation: form.pickupLocation.trim(),
    pickupPincode: form.pickupPincode.trim(),
    // Blank means "keep the saved password"; the server never returns it.
    ...(form.password ? { password: form.password } : {}),
    ...extra,
  });

  const save = async (extra = {}) => {
    try {
      setSaving(true);
      const res = await adminAPI.updateShippingSettings(body(extra));
      load(res?.data?.data || state);
      toast.success("Shiprocket settings saved");
    } catch (e) {
      toast.error(errorMessage(e, "Could not save Shiprocket settings"));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    try {
      setTesting(true);
      setPickups(null);
      const res = await adminAPI.testShippingSettings(body());
      const list = res?.data?.data?.pickupLocations || [];
      setPickups(list);
      toast.success(`Connected to Shiprocket${list.length ? `: ${list.length} pickup location${list.length === 1 ? "" : "s"} found` : ""}`);
    } catch (e) {
      toast.error(errorMessage(e, "Could not connect to Shiprocket"));
    } finally {
      setTesting(false);
    }
  };

  const removePassword = () => {
    if (!window.confirm("Remove the saved Shiprocket login? Shop orders will stop being booked with Shiprocket.")) return;
    save({ password: "" });
  };

  const sr = state?.shiprocket || {};
  const live = state?.active === "shiprocket";

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200">
      <div className="px-4 py-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Truck className="w-4 h-4" /> Shiprocket (courier for Shop orders)
          </h3>
          {state && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              On
              <button
                type="button"
                role="switch"
                aria-checked={sr.enabled !== false}
                aria-label="Use Shiprocket"
                disabled={saving}
                onClick={() => save({ enabled: sr.enabled === false })}
                className={`inline-flex items-center w-10 h-5 shrink-0 rounded-full border transition-all disabled:opacity-60 ${sr.enabled !== false ? "bg-blue-600 border-blue-600 justify-end" : "bg-slate-200 border-slate-300 justify-start"}`}
              >
                <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
              </button>
            </label>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Use an API user from your Shiprocket panel (Settings → API → Configure), not your normal Shiprocket login.
        </p>

        {!state ? (
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        ) : (
          <>
            <div className={`mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${live ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {live ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>
                {live
                  ? `Shop orders are booked with Shiprocket, using ${SOURCE_LABEL[state.source]}.`
                  : state.forcedMock
                    ? "The server is set to the test courier (SHIPPING_PROVIDER=mock), so nothing is booked with Shiprocket."
                    : "Shiprocket is not in use: Shop orders get test tracking numbers and no courier is booked. Enter the API login below and save."}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="sr-email">API user email</label>
                <input id="sr-email" type="email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="api-user@yourshop.com" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="sr-password">API user password</label>
                <div className="relative">
                  <input
                    id="sr-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder={sr.passwordSet ? "Saved. Leave blank to keep it" : "Password"}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {sr.passwordSet && (
                  <button type="button" onClick={removePassword} className="text-[11px] text-red-600 mt-1">Remove saved login</button>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="sr-pickup">Pickup location nickname</label>
                <input id="sr-pickup" value={form.pickupLocation} onChange={(e) => set("pickupLocation", e.target.value)} placeholder="Primary" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <p className="text-[11px] text-slate-500 mt-1">Exactly as named in Shiprocket → Settings → Pickup Addresses. Test the connection to see the list.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="sr-pin">Pickup pincode</label>
                <input id="sr-pin" inputMode="numeric" maxLength={6} value={form.pickupPincode} onChange={(e) => set("pickupPincode", e.target.value.replace(/\D/g, ""))} placeholder="452010" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <p className="text-[11px] text-slate-500 mt-1">Used for delivery-time estimates when a seller has no pincode.</p>
              </div>
            </div>

            {pickups && (
              <div className="mt-4 rounded-md border border-slate-200 px-3 py-2">
                <p className="text-xs font-medium text-slate-700 mb-2">Pickup locations on this Shiprocket account</p>
                {pickups.length === 0 ? (
                  <p className="text-xs text-slate-500">None yet. Add a pickup address in Shiprocket first.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {pickups.map((p) => (
                      <button
                        key={`${p.nickname}-${p.pincode}`}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, pickupLocation: p.nickname, pickupPincode: p.pincode || f.pickupPincode }))}
                        className={`px-2.5 py-1 rounded-full border text-xs ${form.pickupLocation === p.nickname ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700"}`}
                      >
                        {p.nickname} · {p.pincode}{p.city ? `, ${p.city}` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 mt-4">
              <button type="button" onClick={test} disabled={testing || saving} className="px-4 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 disabled:opacity-50">
                {testing ? "Testing…" : "Test connection"}
              </button>
              <button type="button" onClick={() => save()} disabled={saving || testing} className="px-4 py-2 rounded-md bg-blue-600 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Saving…" : "Save Shiprocket settings"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
