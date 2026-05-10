"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useActiveProject } from "./ActiveProjectProvider";

export interface ProjectSwitcherModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProjectSwitcherModal({
  open,
  onClose,
}: ProjectSwitcherModalProps) {
  const router = useRouter();
  const { activeProject, projects, setActiveProjectById } = useActiveProject();

  const handleSelect = (id: string) => {
    setActiveProjectById(id);
    onClose();
  };

  const handleManage = () => {
    onClose();
    router.push("/projects");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Switch project"
      maxWidth={440}
      footer={
        <Button variant="secondary" size="sm" onClick={handleManage}>
          <Icon name="plus" size={12} /> Manage projects
        </Button>
      }
    >
      <div style={{ margin: "calc(-1 * var(--pad-lg))" }}>
        {projects.map((p) => (
          <div
            key={p.id}
            className="output-row"
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer", padding: "14px 24px" }}
            onClick={() => handleSelect(p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelect(p.id);
              }
            }}
          >
            <div className={`project-dot ${p.status}`} style={{ width: 10, height: 10 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              <div className="mono muted" style={{ fontSize: 11 }}>
                {p.email}
              </div>
            </div>
            {activeProject.id === p.id && <Icon name="check" size={14} />}
          </div>
        ))}
      </div>
    </Modal>
  );
}
