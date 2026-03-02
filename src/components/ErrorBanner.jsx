export default function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-red-900/50 border border-red-700/50 text-red-200 rounded mx-4 mt-2 text-sm">
      <span>{error}</span>
      <button onClick={onDismiss} className="ml-3 text-red-300 hover:text-red-100 transition-colors text-base leading-none">✕</button>
    </div>
  );
}
