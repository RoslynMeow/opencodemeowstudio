import { FolderSearch, MessageSquare } from "lucide-react"
import { useState } from "react"
import { FilePanel, type FilePanelTab } from "../components/FilePanel"
import { Button, PageHeader } from "../components/ui"
import { useStudio } from "../store/useStore"
import { useT } from "../i18n/useT"

export function FilesView() {
  const { t } = useT()
  const setView = useStudio((store) => store.setView)
  const [tab] = useState<FilePanelTab>("explorer")

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={t("files.eyebrow")}
        title={t("files.title")}
        description={t("files.pageDescription")}
        actions={
          <Button variant="ghost" onClick={() => setView("chat")}>
            <MessageSquare size={13} /> {t("chat.title")}
          </Button>
        }
      />
      <div className="min-h-0 flex-1">
        <FilePanel tab={tab} onTabChange={() => undefined} mode="page" showTabs={false} />
      </div>
    </div>
  )
}