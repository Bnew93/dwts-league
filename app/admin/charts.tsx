"use client";

import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { day: string; dau: number; leagues: number };

const axis = { stroke: "#6f6a80", fontSize: 10 } as const;
const tip = { contentStyle: { background: "#170c25", border: "1px solid rgba(233,194,80,.3)", borderRadius: 8, fontSize: 12 } } as const;

/** Two small charts: daily active users and league creations, last 30 days. */
export function AdminCharts({ series }: { series: Point[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <div className="eyebrow mb-2">Daily active users</div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="day" {...axis} interval={6} tickLine={false} axisLine={false} />
              <YAxis {...axis} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip {...tip} />
              <Line type="monotone" dataKey="dau" stroke="#e9c250" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Leagues created</div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="day" {...axis} interval={6} tickLine={false} axisLine={false} />
              <YAxis {...axis} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip {...tip} />
              <Bar dataKey="leagues" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
