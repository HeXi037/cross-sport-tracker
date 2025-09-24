"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../../../lib/api";

interface Comment {
  id: string;
  playerId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

interface PaginatedComments {
  items: Comment[];
  total: number;
  limit: number;
  offset: number;
}

export default function PlayerComments({ playerId }: { playerId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState("");
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const load = useCallback(async () => {
    const resp = await apiFetch(`/v0/players/${playerId}/comments`);
    if (resp.ok) {
      const data = (await resp.json()) as PaginatedComments;
      setComments(data.items ?? []);
    }
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const resp = await apiFetch(`/v0/players/${playerId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content }),
    });
    if (resp.ok) {
      setContent("");
      await load();
    }
  }

  async function remove(id: string) {
    if (!token) return;
    const resp = await apiFetch(`/v0/players/${playerId}/comments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      await load();
    }
  }

  return (
    <section className="mt-4">
      <h2 className="heading">Comments</h2>
      {comments.length ? (
        <ul>
          {comments.map((c) => (
            <li key={c.id} className="mb-2">
              <div>{c.content}</div>
              <div className="text-sm text-gray-700">
                {c.username} · {new Date(c.createdAt).toLocaleString()}
                {token && (
                  <button
                    onClick={() => remove(c.id)}
                    className="ml-2 text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No comments.</p>
      )}
      {token && (
        <form onSubmit={submit} className="mt-2">
          <label className="sr-only" htmlFor="player-comment-input">
            Add a comment
          </label>
          <textarea
            id="player-comment-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="border p-2 w-full"
          />
          <button type="submit" className="btn mt-2">
            Add Comment
          </button>
        </form>
      )}
    </section>
  );
}
