"use client";
import { useState, useEffect } from "react";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function MatchDetail({ params }: { params: { mid: string } }) {
  const mid = params.mid;
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});

  async function load() {
    const res = await fetch(`${base}/v0/matches/${mid}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events);
      setSummary(data.summary || {});
    }
  }
  useEffect(() => { load(); }, [mid]);

  useEffect(() => {
    const wsBase = base.startsWith("http") ? base.replace("http", "ws") : `ws://${location.host}/api`;
    const ws = new WebSocket(`${wsBase}/v0/matches/${mid}/stream`);
    ws.onmessage = ev => {
      const data = JSON.parse(ev.data);
      if (data.event) setEvents(prev => [...prev, { id: Date.now().toString(), ...data.event }]);
      if (data.summary) setSummary(data.summary);
    };
    return () => ws.close();
  }, [mid]);

  async function send(by: string) {
    await fetch(`${base}/v0/matches/${mid}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "POINT", by }),
    });
  }

  return (
    <main className="container">
      <h1 className="heading">Match {mid}</h1>
      <div>Summary: {JSON.stringify(summary)}</div>
      <button className="button" onClick={() => send("A")}>Point A</button>
      <button className="button" onClick={() => send("B")}>Point B</button>
      <ul>
        {events.map((e: any) => <li key={e.id}>{e.type || e.event?.type} {JSON.stringify(e.payload || e)}</li>)}
      </ul>
    </main>
  );
}
