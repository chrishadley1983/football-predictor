import { formatDate } from '@/lib/utils'
import type { Post } from '@/lib/types'

interface BlogPostProps {
  post: Post
}

export function BlogPost({ post }: BlogPostProps) {
  // Simple markdown-to-HTML rendering for common patterns
  function renderMarkdown(md: string): string {
    let html = md
      // Headings
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-3 text-gray-900 dark:text-gray-100">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4 text-gray-900 dark:text-gray-100">$1</h1>')
      // Bold and italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-green-600 underline hover:text-green-700">$1</a>')
      // Lists
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
      // Paragraphs (double newlines)
      .replace(/\n\n/g, '</p><p class="mb-3">')
      // Single newlines
      .replace(/\n/g, '<br/>')

    return `<p class="mb-3">${html}</p>`
  }

  return (
    <article className="prose-sm">
      <header className="mb-4 border-b border-gray-200 pb-4 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{post.title}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{post.author}</span>
          <span>{formatDate(post.published_at)}</span>
        </div>
      </header>
      <div
        className="text-sm leading-relaxed text-gray-700 dark:text-gray-300"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
      />
    </article>
  )
}
