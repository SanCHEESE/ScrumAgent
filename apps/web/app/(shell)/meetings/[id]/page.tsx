// Filled in by ScrumAgent-4rs (Meeting detail — Summary/Transcript/Actions/Decisions/Outputs).
export default function MeetingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="page">
      <h1 className="page-title">Meeting placeholder</h1>
      <p className="page-subtitle mono">id: {params.id}</p>
    </div>
  );
}
