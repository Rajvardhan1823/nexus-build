import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Github,
  Heart,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Upload,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

import logoAsset from "@/assets/nexus-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexus — Career Intelligence" },
      {
        name: "description",
        content: "Find, understand, and act on the roles that fit your career.",
      },
      { property: "og:title", content: "Nexus — Career Intelligence" },
      {
        property: "og:description",
        content: "A private workspace for career matches, applications, and AI guidance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Listing = Database["public"]["Tables"]["listings"]["Row"];
type Resume = Database["public"]["Tables"]["resumes"]["Row"];
type Match = Database["public"]["Tables"]["matches"]["Row"];
type Shortlist = Database["public"]["Tables"]["shortlist_items"]["Row"];
type Job = Database["public"]["Tables"]["action_jobs"]["Row"];
type User = { id: string; email?: string | null; user_metadata?: Record<string, unknown> };

type WorkspaceData = {
  listings: Listing[];
  resumes: Resume[];
  matches: Match[];
  shortlist: Shortlist[];
  jobs: Job[];
};

const emptyWorkspace: WorkspaceData = {
  listings: [],
  resumes: [],
  matches: [],
  shortlist: [],
  jobs: [],
};

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "matches", label: "Matches", icon: BriefcaseBusiness },
  { id: "shortlist", label: "Shortlist", icon: Heart },
  { id: "resume", label: "Resume", icon: FileText },
];

function Index() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [activeView, setActiveView] = useState("overview");
  const [search, setSearch] = useState("");
  const [showIngest, setShowIngest] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (mounted) {
        setUser(sessionData.session?.user ?? null);
        setAuthReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [listings, resumes, matches, shortlist, jobs] = await Promise.all([
      supabase.from("listings").select("*").order("created_at", { ascending: false }),
      supabase.from("resumes").select("*").order("created_at", { ascending: false }),
      supabase.from("matches").select("*").order("score", { ascending: false }),
      supabase.from("shortlist_items").select("*").order("created_at", { ascending: false }),
      supabase.from("action_jobs").select("*").order("created_at", { ascending: false }),
    ]);
    const error = [listings, resumes, matches, shortlist, jobs].find((result) => result.error)?.error;
    if (error) setNotice(error.message);
    setData({
      listings: listings.data ?? [],
      resumes: resumes.data ?? [],
      matches: matches.data ?? [],
      shortlist: shortlist.data ?? [],
      jobs: jobs.data ?? [],
    });
    setLoading(false);
  };

  useEffect(() => {
    if (user) void loadData();
  }, [user]);

  if (!authReady) return <LoadingScreen />;
  if (!user) return <AuthScreen mode={authMode} onModeChange={setAuthMode} />;

  const displayName = getDisplayName(user);
  const matchByListing = new Map(data.matches.map((match) => [match.listing_id, match]));
  const shortlistIds = new Set(data.shortlist.map((item) => item.listing_id));
  const visibleListings = data.listings.filter((listing) => {
    const haystack = `${listing.title} ${listing.company} ${listing.location ?? ""} ${listing.required_skills.join(" ")}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });
  const activity = [...data.jobs, ...data.listings.map((listing) => ({ ...listing, job_type: "listing", status: listing.extraction_status, created_at: listing.created_at, id: listing.id }))]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  return (
    <div className="nexus-app min-h-screen bg-background text-foreground">
      <aside className="nexus-rail hidden w-[76px] shrink-0 flex-col items-center border-r border-border bg-surface/70 py-6 lg:flex">
        <button className="mb-10 cursor-pointer" onClick={() => setActiveView("overview")} aria-label="Go to overview">
          <img src={logoAsset.url} alt="Nexus" className="size-10 rounded-xl object-cover shadow-lg shadow-primary/20" />
        </button>
        <nav className="flex flex-col gap-4" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                className={`nexus-icon-button ${active ? "is-active" : ""}`}
                onClick={() => setActiveView(item.id)}
                aria-label={item.label}
                title={item.label}
              >
                <Icon />
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <button className="nexus-icon-button" onClick={() => setShowProfile(true)} aria-label="Settings" title="Settings">
            <Settings2 />
          </button>
          <button className="nexus-avatar" onClick={() => setShowProfile(true)} aria-label="Open profile">
            {getInitials(displayName)}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="nexus-command-bar flex min-h-16 items-center gap-4 border-b border-border px-4 sm:px-6">
          <button className="nexus-icon-button lg:hidden" onClick={() => setActiveView("overview")} aria-label="Open overview">
            <Menu />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3 text-muted-foreground">
            <span className="hidden font-mono text-xs opacity-60 sm:inline">$ nexus</span>
            <span className="hidden h-4 w-px bg-border sm:inline" />
            <Search className="size-4 shrink-0" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search listings, companies, or skills..."
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <kbd className="hidden rounded border border-border bg-surface px-2 py-1 font-mono text-[10px] text-muted-foreground md:inline">⌘ K</kbd>
          <Button variant="ghost" size="icon" onClick={() => setShowProfile(true)} aria-label="Open profile" title="Profile">
            <UserRound />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <section className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-5xl space-y-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="nexus-eyebrow">Career intelligence / {activeView}</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Good to see you, {displayName.split(" ")[0]}.</h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Your private workspace for finding the next role worth your time.</p>
                </div>
                <Button onClick={() => setShowIngest(true)} className="gap-2"><Plus /> Add listing</Button>
              </div>

              <OverviewStats data={data} />

              {activeView === "resume" ? (
                <ResumePanel user={user} resumes={data.resumes} onRefresh={loadData} onNotice={setNotice} />
              ) : activeView === "shortlist" ? (
                <ListingStream
                  title="Your shortlist"
                  listings={visibleListings.filter((listing) => shortlistIds.has(listing.id))}
                  matchByListing={matchByListing}
                  shortlistIds={shortlistIds}
                  onToggleShortlist={async (listingId) => {
                    await toggleShortlist(user.id, listingId, shortlistIds.has(listingId));
                    await loadData();
                  }}
                  emptyTitle="Your shortlist is clear"
                  emptyDescription="Save a role from Matches to keep it here for applications and LaunchKits."
                />
              ) : activeView === "matches" ? (
                <ListingStream
                  title="Best matches"
                  listings={visibleListings.sort((a, b) => (matchByListing.get(b.id)?.score ?? 0) - (matchByListing.get(a.id)?.score ?? 0))}
                  matchByListing={matchByListing}
                  shortlistIds={shortlistIds}
                  onToggleShortlist={async (listingId) => {
                    await toggleShortlist(user.id, listingId, shortlistIds.has(listingId));
                    await loadData();
                  }}
                  emptyTitle="No matches yet"
                  emptyDescription="Upload a resume and add a listing to start your matching pipeline."
                />
              ) : (
                <>
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="nexus-section-title"><span className="nexus-live-dot" /> Live workspace</h2>
                      <Button variant="ghost" size="sm" onClick={() => void loadData()} disabled={loading} title="Refresh workspace"> <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button>
                    </div>
                    <div className="nexus-activity-list">
                      {activity.length === 0 ? <EmptyActivity onAdd={() => setShowIngest(true)} /> : activity.map((item) => <ActivityRow key={item.id} item={item} />)}
                    </div>
                  </section>
                  <ListingStream
                    title="Recent opportunities"
                    listings={visibleListings.slice(0, 5)}
                    matchByListing={matchByListing}
                    shortlistIds={shortlistIds}
                    onToggleShortlist={async (listingId) => {
                      await toggleShortlist(user.id, listingId, shortlistIds.has(listingId));
                      await loadData();
                    }}
                    emptyTitle="Your opportunity feed is ready"
                    emptyDescription="Add a public listing URL to normalize it, score it against your resume, and keep it actionable."
                  />
                </>
              )}
            </div>
          </section>

          <AssistantPanel user={user} data={data} onNotice={setNotice} />
        </div>
      </main>

      {showIngest && <IngestDialog user={user} resume={data.resumes[0]} onClose={() => setShowIngest(false)} onComplete={async () => { setShowIngest(false); await loadData(); }} onNotice={setNotice} />}
      {showProfile && <ProfileDialog user={user} onClose={() => setShowProfile(false)} onSignedOut={() => setUser(null)} />}
      {notice && <Notice message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}

function OverviewStats({ data }: { data: WorkspaceData }) {
  const stats = [
    { label: "Listings", value: data.listings.length, detail: "normalized opportunities", tone: "text-primary" },
    { label: "Matches", value: data.matches.length, detail: "scored against your resume", tone: "text-accent" },
    { label: "Shortlist", value: data.shortlist.length, detail: "roles worth revisiting", tone: "text-emerald-400" },
    { label: "Action jobs", value: data.jobs.length, detail: "LaunchKit and Radar runs", tone: "text-amber-300" },
  ];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="nexus-stat"><div className="nexus-eyebrow">{stat.label}</div><div className={`mt-3 font-mono text-3xl ${stat.tone}`}>{stat.value.toString().padStart(2, "0")}</div><p className="mt-2 text-xs text-muted-foreground">{stat.detail}</p></div>)}</div>;
}

function ListingStream({ title, listings, matchByListing, shortlistIds, onToggleShortlist, emptyTitle, emptyDescription }: { title: string; listings: Listing[]; matchByListing: Map<string, Match>; shortlistIds: Set<string>; onToggleShortlist: (listingId: string) => Promise<void>; emptyTitle: string; emptyDescription: string }) {
  return <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="nexus-section-title"><span className="nexus-live-dot" /> {title}</h2><span className="font-mono text-xs text-muted-foreground">{listings.length.toString().padStart(2, "0")} records</span></div>{listings.length === 0 ? <div className="nexus-empty"><Inbox className="size-6 text-muted-foreground" /><h3>{emptyTitle}</h3><p>{emptyDescription}</p></div> : <div className="space-y-3">{listings.map((listing) => <ListingRow key={listing.id} listing={listing} match={matchByListing.get(listing.id)} shortlisted={shortlistIds.has(listing.id)} onToggle={() => onToggleShortlist(listing.id)} />)}</div>}</section>;
}

function ListingRow({ listing, match, shortlisted, onToggle }: { listing: Listing; match?: Match; shortlisted: boolean; onToggle: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const score = match?.score ?? 0;
  const save = async () => { setSaving(true); await onToggle(); setSaving(false); };
  return <article className="nexus-listing group"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="nexus-pill">{listing.source}</span>{score > 0 && <span className="nexus-pill nexus-pill-accent">{Math.round(score)}% fit</span>}{listing.remote_ok && <span className="nexus-pill">Remote</span>}</div><h3 className="mt-3 truncate text-sm font-semibold text-foreground">{listing.title}</h3><p className="mt-1 text-xs text-muted-foreground">{listing.company}{listing.location ? ` · ${listing.location}` : ""}</p><div className="mt-3 flex flex-wrap gap-2">{listing.required_skills.slice(0, 4).map((skill) => <span key={skill} className="text-[11px] text-muted-foreground">#{skill}</span>)}</div>{match?.explanation && <p className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">{match.explanation}</p>}</div><div className="flex shrink-0 items-start gap-2"><Button variant="ghost" size="icon" onClick={() => void save()} disabled={saving} aria-label={shortlisted ? "Remove from shortlist" : "Save to shortlist"} title={shortlisted ? "Remove from shortlist" : "Save to shortlist"}>{shortlisted ? <Heart className="fill-current text-accent" /> : <Heart />}</Button><Button asChild variant="outline" size="icon" aria-label="Open listing" title="Open listing"><a href={listing.source_url} target="_blank" rel="noreferrer"><ArrowUpRight /></a></Button></div></article>;
}

function ActivityRow({ item }: { item: Job | (Listing & { job_type: string; status: string }) }) {
  const isJob = "job_type" in item && item.job_type !== "listing";
  const title = isJob ? `${item.job_type} job` : item.title;
  const detail = isJob ? `${item.status} · action queue` : `${item.company} · ${item.extraction_status}`;
  return <div className="nexus-activity-row"><div className="nexus-time">{formatTime(item.created_at)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={`nexus-pill ${isJob ? "nexus-pill-accent" : ""}`}>{isJob ? "Action" : "Listing"}</span><span className="truncate text-sm font-semibold">{title}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p></div><Activity className="size-4 shrink-0 text-muted-foreground" /></div>;
}

function EmptyActivity({ onAdd }: { onAdd: () => void }) { return <div className="nexus-empty"><Activity className="size-6 text-primary" /><h3>No activity yet</h3><p>Your normalized listings, matches, and action jobs will appear here.</p><Button variant="outline" size="sm" onClick={onAdd}><Plus /> Add your first listing</Button></div>; }

function ResumePanel({ user, resumes, onRefresh, onNotice }: { user: User; resumes: Resume[]; onRefresh: () => Promise<void>; onNotice: (message: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File) => {
    if (!file.type.startsWith("text/") && !/[.](txt|md|rtf)$/i.test(file.name)) { onNotice("For reliable extraction, upload a .txt, .md, or .rtf resume file."); return; }
    setUploading(true);
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const text = (await file.text()).slice(0, 30000);
    const uploadResult = await supabase.storage.from("resumes").upload(path, file, { upsert: true });
    if (uploadResult.error) { onNotice(uploadResult.error.message); setUploading(false); return; }
    const insertResult = await supabase.from("resumes").insert({ user_id: user.id, file_name: file.name, storage_path: path, extracted_text: text, processing_status: "ready" });
    if (insertResult.error) onNotice(insertResult.error.message); else onNotice("Resume uploaded. Add listings to score them against it.");
    setUploading(false);
    await onRefresh();
  };
  return <section className="nexus-panel space-y-5"><div><p className="nexus-eyebrow">Profile signal</p><h2 className="mt-2 text-lg font-semibold">Your resume</h2><p className="mt-1 text-sm text-muted-foreground">Nexus uses your extracted resume text to explain why a role fits.</p></div><label className="nexus-upload"><Upload className="size-5 text-primary" /><span>{uploading ? "Uploading..." : "Choose a .txt, .md, or .rtf resume"}</span><input type="file" accept=".txt,.md,.rtf,text/plain" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>{resumes.length === 0 ? <div className="nexus-empty py-8"><FileText className="size-5 text-muted-foreground" /><p>No resume uploaded yet.</p></div> : resumes.map((resume) => <div key={resume.id} className="flex items-center gap-3 border-t border-border pt-4"><FileText className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{resume.file_name}</p><p className="text-xs text-muted-foreground">{resume.processing_status} · {formatDate(resume.created_at)}</p></div><Check className="size-4 text-emerald-400" /></div>)}</section>;
}

function AssistantPanel({ user, data, onNotice }: { user: User; data: WorkspaceData; onNotice: (message: string) => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [trace, setTrace] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const ask = async () => {
    if (!question.trim()) return;
    setAsking(true); setTrace("Querying your private workspace...");
    const response = await fetch("/api/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", question, context: { listings: data.listings.slice(0, 40), matches: data.matches, shortlist: data.shortlist } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) onNotice(payload.error ?? "The assistant could not answer right now."); else setAnswer(payload.answer);
    setTrace(response.ok ? "Answered from the records currently in your workspace." : null); setAsking(false);
  };
  return <aside className="nexus-assistant w-full shrink-0 border-t border-border xl:w-[340px] xl:border-l xl:border-t-0"><div className="flex items-center justify-between border-b border-border px-5 py-5"><div><p className="nexus-eyebrow">Workspace agent</p><h2 className="mt-1 text-sm font-bold uppercase tracking-widest">Nexus AI</h2></div><span className="nexus-live-dot" /></div><div className="flex flex-1 flex-col gap-5 p-5"><div className="space-y-2"><div className="font-mono text-[11px] text-primary">[context]</div><div className="nexus-message">{data.listings.length ? `I can search ${data.listings.length} listing${data.listings.length === 1 ? "" : "s"}, ${data.matches.length} match${data.matches.length === 1 ? "" : "es"}, and your shortlist.` : "Upload a resume and add listings, then ask me questions about your opportunities."}</div></div>{answer && <div className="space-y-2"><div className="font-mono text-[11px] text-accent">[response]</div><div className="text-sm leading-6 text-foreground">{answer}</div></div>}{trace && <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{trace}</div>}<div className="mt-auto rounded-xl border border-primary/15 bg-primary/5 p-4"><p className="nexus-eyebrow">Try asking</p><button className="mt-2 text-left text-xs italic text-foreground" onClick={() => setQuestion("Which saved roles should I prioritize this week?")}>“Which saved roles should I prioritize this week?”</button></div></div><div className="border-t border-border p-4"><div className="flex items-end gap-2 rounded-lg border border-border bg-background p-2 focus-within:border-primary/50"><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Ask about your roles..." rows={2} className="min-h-0 resize-none border-0 bg-transparent p-1 text-xs shadow-none focus-visible:ring-0" /><Button size="icon" onClick={() => void ask()} disabled={asking || !question.trim()} aria-label="Ask Nexus" title="Ask Nexus"><Send /></Button></div></div></aside>;
}

function IngestDialog({ user, resume, onClose, onComplete, onNotice }: { user: User; resume?: Resume; onClose: () => void; onComplete: () => Promise<void>; onNotice: (message: string) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const ingest = async () => {
    if (!url.trim()) return;
    setBusy(true);
    const response = await fetch("/api/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ingest_listing", url: url.trim(), resumeText: resume?.extracted_text ?? "" }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { onNotice(payload.error ?? "That listing could not be processed."); setBusy(false); return; }
    const listing = payload.listing as Database["public"]["Tables"]["listings"]["Insert"];
    const inserted = await supabase.from("listings").upsert({ ...listing, source_url: url.trim(), source: listing.source || "manual" }, { onConflict: "source,source_url" }).select().single();
    if (inserted.error || !inserted.data) { onNotice(inserted.error?.message ?? "The listing was not saved."); setBusy(false); return; }
    if (resume) {
      await supabase.from("matches").upsert({ user_id: user.id, resume_id: resume.id, listing_id: inserted.data.id, score: payload.score ?? 0, explanation: payload.explanation ?? null }, { onConflict: "user_id,resume_id,listing_id" });
    }
    onNotice("Listing normalized and added to your workspace."); setBusy(false); await onComplete();
  };
  return <div className="nexus-modal-backdrop"><div className="nexus-modal"><div className="flex items-start justify-between gap-4"><div><p className="nexus-eyebrow">Ingestion pipeline</p><h2 className="mt-2 text-xl font-semibold">Add an opportunity</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Paste a public job or internship URL. Nexus will normalize the page, extract skills, and score it against your resume.</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div><div className="mt-6 space-y-3"><label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground" htmlFor="listing-url">Public listing URL</label><Input id="listing-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://company.com/jobs/..." autoFocus /></div><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => void ingest()} disabled={busy || !url.trim()}>{busy ? <><RefreshCw className="animate-spin" /> Processing</> : <><Sparkles /> Normalize listing</>}</Button></div></div></div>;
}

function ProfileDialog({ user, onClose, onSignedOut }: { user: User; onClose: () => void; onSignedOut: () => void }) {
  const signOut = async () => { await supabase.auth.signOut(); onSignedOut(); };
  return <div className="nexus-modal-backdrop"><div className="nexus-modal max-w-md"><div className="flex items-start justify-between"><div><p className="nexus-eyebrow">Account</p><h2 className="mt-2 text-xl font-semibold">{getDisplayName(user)}</h2><p className="mt-1 text-sm text-muted-foreground">{user.email}</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div><div className="mt-8 flex gap-2"><Button variant="outline" onClick={() => void signOut()}><LogOut /> Sign out</Button></div></div></div>;
}

function AuthScreen({ mode, onModeChange }: { mode: "sign-in" | "sign-up"; onModeChange: (mode: "sign-in" | "sign-up") => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState(false);
  const submit = async () => { setBusy(true); setError(null); const result = mode === "sign-in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password }); if (result.error) setError(result.error.message); else if (mode === "sign-up") setSent(true); setBusy(false); };
  const google = async () => { const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (result.error) setError(result.error.message); };
  return <div className="nexus-auth min-h-screen bg-background"><div className="nexus-auth-grid" /><div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-5 py-10"><div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface/70 shadow-2xl lg:grid-cols-[1.1fr_.9fr]"><div className="hidden min-h-[560px] flex-col justify-between border-r border-border p-10 lg:flex"><div><img src={logoAsset.url} alt="Nexus" className="size-14 rounded-2xl object-cover" /><p className="nexus-eyebrow mt-12">Autonomous career intelligence</p><h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight">Less scrolling. More signal.</h1><p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">Nexus turns messy job listings into structured, personal, actionable opportunities.</p></div><div className="flex items-center gap-3 text-xs text-muted-foreground"><Zap className="size-4 text-primary" /> Private by default · powered by your own workspace</div></div><div className="p-6 sm:p-10"><div className="flex items-center gap-3 lg:hidden"><img src={logoAsset.url} alt="Nexus" className="size-10 rounded-xl object-cover" /><span className="text-lg font-semibold">Nexus</span></div><div className="mt-8 lg:mt-0"><p className="nexus-eyebrow">Your workspace</p><h2 className="mt-2 text-2xl font-semibold">{mode === "sign-in" ? "Welcome back" : "Create your workspace"}</h2><p className="mt-2 text-sm text-muted-foreground">{mode === "sign-in" ? "Pick up where your search left off." : "Start building a career search that remembers what matters."}</p></div>{sent ? <div className="mt-8 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-6 text-emerald-200">Check your email to confirm your account, then come back to Nexus.</div> : <><div className="mt-8 space-y-3"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" /></div>{error && <p className="mt-3 text-sm text-red-300">{error}</p>}<Button className="mt-5 w-full" onClick={() => void submit()} disabled={busy || !email || !password}>{busy ? "Working..." : mode === "sign-in" ? "Enter Nexus" : "Create account"}</Button><div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" /></div><Button variant="outline" className="w-full" onClick={() => void google()}><Github /> Continue with Google</Button><p className="mt-6 text-center text-sm text-muted-foreground">{mode === "sign-in" ? "New to Nexus?" : "Already have an account?"} <button className="font-medium text-primary hover:underline" onClick={() => onModeChange(mode === "sign-in" ? "sign-up" : "sign-in")}>{mode === "sign-in" ? "Create one" : "Sign in"}</button></p></>}</div></div></div></div>;
}

function LoadingScreen() { return <div className="flex min-h-screen items-center justify-center bg-background"><RefreshCw className="size-5 animate-spin text-primary" /></div>; }
function Notice({ message, onClose }: { message: string; onClose: () => void }) { return <div className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm shadow-2xl"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" /><span className="flex-1 leading-6">{message}</span><button onClick={onClose} aria-label="Close notice"><X className="size-4 text-muted-foreground" /></button></div>; }

async function toggleShortlist(userId: string, listingId: string, exists: boolean) { if (exists) await supabase.from("shortlist_items").delete().eq("user_id", userId).eq("listing_id", listingId); else await supabase.from("shortlist_items").insert({ user_id: userId, listing_id: listingId, status: "saved" }); }
function getDisplayName(user: User) { return typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email?.split("@")[0] ?? "there"; }
function getInitials(value: string) { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }