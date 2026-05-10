import Link from "next/link";
import type { JSX } from "react";
import { Icon } from "@/components/ui/Icon";
import { ProjectsList } from "@/components/screens/projects/ProjectsList";

interface ProjectsPageProps {
  searchParams?: { created?: string };
}

export default function ProjectsPage({
  searchParams,
}: ProjectsPageProps): JSX.Element {
  const justCreated = searchParams?.created === "1";
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <div className="page-subtitle">
            Each project is a Google Workspace + Jira + Notion bundle.
          </div>
        </div>
        <Link href="/projects/new" className="btn btn-primary">
          <Icon name="plus" size={14} />
          Add project
        </Link>
      </div>

      <ProjectsList />

      {justCreated && (
        <div className="toast" role="status">
          <Icon name="check" size={14} />
          Project created
        </div>
      )}
    </div>
  );
}
