import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@store/api";

const SWITCHES = [
  { key: "online", label: "Online payment (Razorpay)", hint: "UPI, cards and netbanking at checkout." },
  { key: "cashOnDelivery", label: "Cash on Delivery", hint: "Customer pays the rider at the door." },
];

/** Which ways to pay checkout offers. Each switch saves on its own, straight away. */
export default function PaymentSwitchesCard() {
  const [settings, setSettings] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    adminAPI
      .getPaymentSettings()
      .then((res) => setSettings(res?.data?.data || null))
      .catch((error) => toast.error(error?.response?.data?.message || "Failed to load payment settings"));
  }, []);

  const toggle = async (key) => {
    const value = !settings[key];
    try {
      setSavingKey(key);
      const res = await adminAPI.updatePaymentSettings({ [key]: value });
      setSettings(res?.data?.data || settings);
      const label = SWITCHES.find((s) => s.key === key)?.label;
      toast.success(`${label} switched ${value ? "on" : "off"}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update payment settings");
    } finally {
      setSavingKey(null);
    }
  };

  const gateway = settings?.gateway || {};

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200">
      <div className="px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Payments at checkout</h3>
        <p className="text-xs text-slate-500 mb-4">Changes apply to new checkouts within 30 seconds. No need to click Save Information.</p>

        {!settings ? (
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        ) : (
          <div className="space-y-3">
            {SWITCHES.map(({ key, label, hint }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500">{hint}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(settings[key])}
                  aria-label={label}
                  disabled={savingKey !== null}
                  onClick={() => toggle(key)}
                  className={`inline-flex items-center w-10 h-5 shrink-0 rounded-full border transition-all disabled:opacity-60 ${settings[key] ? "bg-blue-600 border-blue-600 justify-end" : "bg-slate-200 border-slate-300 justify-start"}`}
                >
                  <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
                </button>
              </div>
            ))}

            {settings.online && gateway.mode === "test" && (
              <Warning text="Razorpay is using TEST keys, so customers cannot really pay. Add the live keys on the server." />
            )}
            {settings.online && !gateway.webhookConfigured && (
              <Warning text="The Razorpay webhook secret is not set on the server. Payments still work, but an order whose customer closes the app before confirming will not be marked paid automatically." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Warning({ text }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}
