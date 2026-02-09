import Markdown from 'react-markdown'
import { formatDate } from '@/lib/utils'
import type { Post } from '@/lib/types'

interface BlogPostProps {
  post: Post
}

export function BlogPost({ post }: BlogPostProps) {
  return (
    <article className="prose-sm">
      <header className="mb-4 border-b border-border-custom pb-4">
        <h1 className="text-2xl font-bold text-foreground">{post.title}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-text-secondary">
          <span>{post.author}</span>
          <span>{post.published_at ? formatDate(post.published_at) : ''}</span>
        </div>
      </header>
      <div className="text-sm leading-relaxed text-text-secondary">
        <Markdown
          components={{
            h1: ({ children }) => (
              <h1 className="mt-6 mb-4 text-2xl font-bold text-foreground">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-6 mb-3 text-xl font-bold text-foreground">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-4 mb-2 text-lg font-semibold text-foreground">{children}</h3>
            ),
            p: ({ children }) => <p className="mb-3">{children}</p>,
            strong: ({ children }) => <strong>{children}</strong>,
            em: ({ children }) => <em>{children}</em>,
            a: ({ href, children }) => {
              const safeHref = href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))
                ? href
                : '#'
              return (
                <a
                  href={safeHref}
                  className="text-gold underline hover:text-gold-light"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              )
            },
            ul: ({ children }) => <ul className="ml-4 list-disc">{children}</ul>,
            ol: ({ children }) => <ol className="ml-4 list-decimal">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
          }}
        >
          {post.content}
        </Markdown>
      </div>
    </article>
  )
}
