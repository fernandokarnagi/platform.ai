export default function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div className="err-banner">{message}</div>;
}
