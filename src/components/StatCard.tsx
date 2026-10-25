type Props = { label: string; value: string; detail?: string };
export default function StatCard({ label, value, detail }: Props) {
  return <div className="stat-card">
    <span className="stat-label">{label}</span>
    <strong className="stat-value">{value}</strong>
    {detail && <span className="stat-detail">{detail}</span>}
  </div>;
}
