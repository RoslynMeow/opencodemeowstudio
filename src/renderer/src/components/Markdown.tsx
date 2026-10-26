import clsx from "clsx"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { rpc } from "../lib/rpc"

const components: Components = {
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault()
          if (href && /^https?:\/\//i.test(href)) void rpc("app.openExternal", href)
        }}
        {...props}
      >
        {children}
      </a>
    )
  },
  img({ src, alt }) {
    return <img src={src} alt={alt ?? ""} className="my-2 max-h-80 rounded-lg border border-line" />
  },
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={clsx("markdown", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
