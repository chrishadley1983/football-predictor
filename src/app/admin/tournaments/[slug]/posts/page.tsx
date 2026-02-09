'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatDate, slugify } from '@/lib/utils'
import type { Tournament, Post } from '@/lib/types'

export default function AdminPostsPage() {
  const { slug } = useParams<{ slug: string }>()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New post form
  const [showForm, setShowForm] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [title, setTitle] = useState('')
  const [postSlug, setPostSlug] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/tournaments/${slug}`)
      if (!res.ok) {
        setError('Tournament not found')
        setLoading(false)
        return
      }
      const data = await res.json()
      setTournament(data)

      const supabase = createClient()
      const { data: postData } = await supabase
        .from('posts')
        .select('*')
        .eq('tournament_id', data.id)
        .order('published_at', { ascending: false })

      if (postData) setPosts(postData as Post[])
      setLoading(false)
    }
    load()
  }, [slug])

  function resetForm() {
    setTitle('')
    setPostSlug('')
    setContent('')
    setEditingPost(null)
    setShowForm(false)
  }

  function handleEdit(post: Post) {
    setEditingPost(post)
    setTitle(post.title)
    setPostSlug(post.slug)
    setContent(post.content)
    setShowForm(true)
  }

  async function handleSave() {
    if (!tournament) return
    setSaving(true)
    setError('')
    setSuccess('')

    const supabase = createClient()

    if (editingPost) {
      // Update existing post
      const { error: updateErr } = await supabase
        .from('posts')
        .update({
          title,
          slug: postSlug,
          content,
        })
        .eq('id', editingPost.id)

      if (updateErr) {
        setError(updateErr.message)
        setSaving(false)
        return
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === editingPost.id ? { ...p, title, slug: postSlug, content } : p
        )
      )
      setSuccess('Post updated')
    } else {
      // Create new post
      const { data: newPost, error: insertErr } = await supabase
        .from('posts')
        .insert({
          tournament_id: tournament.id,
          title,
          slug: postSlug,
          content,
          author: 'Admin',
          is_published: true,
        })
        .select()
        .single()

      if (insertErr) {
        setError(insertErr.message)
        setSaving(false)
        return
      }

      if (newPost) setPosts((prev) => [newPost as Post, ...prev])
      setSuccess('Post created')
    }

    resetForm()
    setSaving(false)
  }

  async function handleDelete(postId: string) {
    const supabase = createClient()
    const { error: deleteErr } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)

    if (deleteErr) {
      setError(deleteErr.message)
      return
    }

    setPosts((prev) => prev.filter((p) => p.id !== postId))
    setSuccess('Post deleted')
    setTimeout(() => setSuccess(''), 2000)
  }

  async function handleTogglePublish(post: Post) {
    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('posts')
      .update({ is_published: !post.is_published })
      .eq('id', post.id)

    if (updateErr) {
      setError(updateErr.message)
      return
    }

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, is_published: !p.is_published } : p
      )
    )
  }

  if (loading) return <p className="py-12 text-center text-gray-500">Loading...</p>
  if (!tournament) return <p className="py-12 text-center text-red-600">{error || 'Tournament not found'}</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tournament.name} - Posts</h1>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>New Post</Button>
        )}
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}
      {success && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{success}</div>}

      {/* Post form */}
      {showForm && (
        <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">{editingPost ? 'Edit Post' : 'New Post'}</h2>}>
          <div className="space-y-4">
            <Input
              label="Title"
              id="postTitle"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (!editingPost) setPostSlug(slugify(e.target.value))
              }}
              required
              placeholder="Post title"
            />
            <Input
              label="Slug"
              id="postSlug"
              value={postSlug}
              onChange={(e) => setPostSlug(e.target.value)}
              required
              placeholder="post-slug"
            />
            <div>
              <label htmlFor="postContent" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Content (Markdown)
              </label>
              <textarea
                id="postContent"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                placeholder="Write your post content in Markdown..."
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} loading={saving}>
                {editingPost ? 'Update' : 'Create'}
              </Button>
              <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Post list */}
      {posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">No posts yet.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{post.title}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    /{post.slug} &middot; {formatDate(post.published_at)} &middot; {post.author}
                  </p>
                </div>
                <Badge variant={post.is_published ? 'green' : 'gray'}>
                  {post.is_published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                {post.content.slice(0, 150)}...
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => handleEdit(post)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleTogglePublish(post)}>
                  {post.is_published ? 'Unpublish' : 'Publish'}
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(post.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
