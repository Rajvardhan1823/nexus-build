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
  Heart,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";


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
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

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
    const remoteListings = listings.data ?? [];
    const localListings = getLocalListings(user.id);
    setData({
      listings: [...localListings, ...remoteListings.filter((listing) => !localListings.some((local) => local.source_url === listing.source_url))],
      resumes: [...getLocalResumes(user.id), ...(resumes.data ?? []).filter((resume) => !getLocalResumes(user.id).some((local) => local.file_name === resume.file_name && local.extracted_text === resume.extracted_text))],
      matches: [...(matches.data ?? []), ...getLocalMatches(user.id)],
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
  }).sort((a, b) => (matchByListing.get(b.id)?.score ?? 0) - (matchByListing.get(a.id)?.score ?? 0));
  const activity = [...data.jobs, ...data.listings.map((listing) => ({ ...listing, job_type: "listing", status: listing.extraction_status, created_at: listing.created_at, id: listing.id }))]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  return (
    <div className="nexus-app min-h-screen bg-background text-foreground">
      <aside className="nexus-rail hidden w-[76px] shrink-0 flex-col items-center border-r border-border bg-surface/70 py-6 lg:flex">
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
                {activeView === "overview" && <Button onClick={() => setShowIngest(true)} className="gap-2"><Plus /> Add listing</Button>}
              </div>

              <OverviewStats data={data} />
              {activeView === "overview" && <AssistantPanel userId={user.id} data={data} onNotice={setNotice} />}

              {activeView === "resume" ? (
                <ResumePanel user={user} resumes={data.resumes} listings={data.listings} onRefresh={loadData} onNotice={setNotice} />
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
                  listings={visibleListings}
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
        </div>
      </main>

      {showIngest && <IngestDialog user={user} resumes={data.resumes} onClose={() => setShowIngest(false)} onComplete={async () => { setShowIngest(false); await loadData(); }} onNotice={setNotice} />}
      {showProfile && <ProfileDialog user={user} onClose={() => setShowProfile(false)} onUpdated={setUser} onSignedOut={() => setUser(null)} />}
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

function ResumePanel({ user, resumes, listings, onRefresh, onNotice }: { user: User; resumes: Resume[]; listings: Listing[]; onRefresh: () => Promise<void>; onNotice: (message: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const scoreExistingResume = async (resume: Resume) => {
    if (!listings.length) { onNotice("Add a listing before scoring this resume."); return; }
    setUploading(true);
    const response = await fetch("/api/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score_listings", resumeText: resume.extracted_text, context: listings }) });
    const payload = await response.json().catch(() => ({}));
    const scores = Array.isArray(payload.scores) ? payload.scores as Array<{ score?: number; explanation?: string }> : [];
    scores.forEach((score, index) => { if (listings[index]) saveLocalMatch(user.id, resume.id, listings[index].id, score); });
    onNotice(response.ok ? `${scores.length} opportunit${scores.length === 1 ? "y was" : "ies were"} scored with ${resume.file_name}.` : payload.error ?? "The listings could not be scored yet.");
    setUploading(false);
    await onRefresh();
  };
  const upload = async (file: File) => {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf && !file.type.startsWith("text/") && !/[.](txt|md|rtf)$/i.test(file.name)) { onNotice("Upload a PDF, TXT, Markdown, or RTF resume file."); return; }
    setUploading(true);
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    let text: string;
    try {
      text = isPdf ? await extractPdfText(file) : (await file.text()).slice(0, 30000);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The PDF could not be read.");
      setUploading(false);
      return;
    }
    if (!text.trim()) { onNotice("No readable text was found in that file. Please upload a text-based PDF or a text resume."); setUploading(false); return; }
    const localResume = saveLocalResume(user.id, file.name, path, text);
    const uploadResult = await supabase.storage.from("resumes").upload(path, file, { upsert: true });
    const insertResult = uploadResult.error ? { error: uploadResult.error } : await supabase.from("resumes").insert({ user_id: user.id, file_name: file.name, storage_path: path, extracted_text: text, processing_status: "ready" });
    if (listings.length) {
      const scoreResponse = await fetch("/api/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "score_listings", resumeText: text, context: listings }) });
      const scorePayload = await scoreResponse.json().catch(() => ({}));
      const scores = Array.isArray(scorePayload.scores) ? scorePayload.scores as Array<{ score?: number; explanation?: string }> : [];
      scores.forEach((score, index) => { if (listings[index]) saveLocalMatch(user.id, localResume.id, listings[index].id, score); });
      if (!scoreResponse.ok) onNotice(scorePayload.error ?? "Resume was saved, but existing listings could not be scored yet.");
      else onNotice(`${insertResult.error ? "Resume extracted and saved locally" : "Resume uploaded"}. ${scores.length} existing opportunit${scores.length === 1 ? "y was" : "ies were"} scored.`);
    } else if (insertResult.error) onNotice("Resume extracted and saved locally. It is ready for scoring."); else onNotice("Resume uploaded. Add listings to score them against it.");
    setUploading(false);
    await onRefresh();
  };
  return <section className="nexus-panel space-y-5"><div><p className="nexus-eyebrow">Profile signal</p><h2 className="mt-2 text-lg font-semibold">Your resume</h2><p className="mt-1 text-sm text-muted-foreground">Nexus extracts text from PDFs and text files to explain why a role fits.</p></div><label className="nexus-upload"><Upload className="size-5 text-primary" /><span>{uploading ? "Uploading..." : "Choose a PDF or text resume"}</span><input type="file" accept=".pdf,.txt,.md,.rtf,application/pdf,text/plain,text/markdown,application/rtf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>{resumes.length === 0 ? <div className="nexus-empty py-8"><FileText className="size-5 text-muted-foreground" /><p>No resume uploaded yet.</p></div> : resumes.map((resume) => <div key={resume.id} className="flex items-center gap-3 border-t border-border pt-4"><FileText className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{resume.file_name}</p><p className="text-xs text-muted-foreground">{resume.processing_status} · {formatDate(resume.created_at)}</p></div><Button variant="outline" size="sm" onClick={() => void scoreExistingResume(resume)} disabled={uploading}>Score jobs</Button><Check className="size-4 text-emerald-400" /></div>)}</section>;
}

function AssistantPanel({ userId, data, onNotice }: { userId: string; data: WorkspaceData; onNotice: (message: string) => void }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>(() => getChatHistory(userId));
  const [asking, setAsking] = useState(false);
  useEffect(() => { setHistory(getChatHistory(userId)); }, [userId]);
  const updateHistory = (next: ChatMessage[]) => { setHistory(next); saveChatHistory(userId, next); };
  const ask = async () => {
    if (!question.trim()) return;
    const submittedQuestion = question.trim();
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: submittedQuestion, createdAt: new Date().toISOString() };
    const nextHistory = [...history, userMessage];
    updateHistory(nextHistory);
    setQuestion("");
    setAsking(true);
    const resumeContext = data.resumes.slice(0, 3).map((resume) => ({ fileName: resume.file_name, extractedText: resume.extracted_text.slice(0, 14000) }));
    const response = await fetch("/api/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", question: submittedQuestion, context: { resumes: resumeContext, listings: data.listings.slice(0, 30), matches: data.matches.slice(0, 50), shortlist: data.shortlist, conversation: nextHistory.slice(-8).map(({ role, content }) => ({ role, content })) } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const answer = payload.error ?? "The assistant could not answer right now.";
      onNotice(answer);
      updateHistory([...nextHistory, { id: crypto.randomUUID(), role: "assistant", content: answer, createdAt: new Date().toISOString() }]);
    } else if (typeof payload.answer === "string") {
      updateHistory([...nextHistory, { id: crypto.randomUUID(), role: "assistant", content: payload.answer, createdAt: new Date().toISOString() }]);
    }
    setAsking(false);
  };
  return <aside className="nexus-assistant w-full rounded-xl border border-border bg-surface/40"><div className="border-b border-border px-5 py-5"><p className="nexus-eyebrow">Career assistant</p><h2 className="mt-1 text-sm font-bold uppercase tracking-widest">Nexus AI</h2></div><div className="flex flex-1 flex-col gap-4 p-5"><div className="nexus-message">{data.resumes.length ? `Using ${data.resumes[0].file_name} and your extracted opportunities.` : "Upload a resume and extract a jobs page, then ask about your opportunities."}</div>{history.map((message) => <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-primary px-4 py-3 text-sm text-primary-foreground" : "max-w-[95%] rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-foreground"}>{message.content}</div>)}{asking && <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm text-primary"><RefreshCw className="size-4 animate-spin" /> Thinking…</div>}{history.length === 0 && <div className="rounded-xl border border-primary/15 bg-primary/5 p-4"><p className="nexus-eyebrow">Try asking</p><button className="mt-2 text-left text-xs italic text-foreground" onClick={() => setQuestion("Which roles should I prioritize based on my resume?")}>“Which roles should I prioritize based on my resume?”</button></div>}</div><div className="border-t border-border p-4"><div className="flex items-end gap-2 rounded-lg border border-border bg-background p-2 focus-within:border-primary/50"><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Ask about your resume or jobs..." rows={2} className="min-h-0 resize-none border-0 bg-transparent p-1 text-xs shadow-none focus-visible:ring-0" /><Button size="icon" onClick={() => void ask()} disabled={asking || !question.trim()} aria-label="Ask Nexus" title="Ask Nexus"><Send /></Button></div></div></aside>;
}

function IngestDialog({ user, resumes, onClose, onComplete, onNotice }: { user: User; resumes: Resume[]; onClose: () => void; onComplete: () => Promise<void>; onNotice: (message: string) => void }) {
  const [url, setUrl] = useState("");
  const [resumeId, setResumeId] = useState(resumes[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const ingest = async () => {
    if (!url.trim()) return;
    setBusy(true);
    const resume = resumes.find((item) => item.id === resumeId);
    const response = await fetch("/api/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ingest_listing", url: url.trim(), resumeText: resume?.extracted_text ?? "" }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { onNotice(payload.error ?? "That listing could not be processed."); setBusy(false); return; }
    const listings = payload.listings as Database["public"]["Tables"]["listings"]["Insert"][];
    const scores = (payload.scores as Array<{ score?: number; explanation?: string }>) ?? [];
    if (!Array.isArray(listings) || listings.length === 0) { onNotice("No opportunities were found on that page."); setBusy(false); return; }
    let savedCount = 0;
    let localCount = 0;
    for (const [index, listing] of listings.entries()) {
      const sourceUrl = `${url.trim()}#nexus-opportunity-${index + 1}`;
      const inserted = await supabase.from("listings").upsert({ ...listing, source_url: sourceUrl, source: listing.source || "website" }, { onConflict: "source,source_url" }).select().single();
      if (inserted.error || !inserted.data) {
        if (isListingWritePolicyError(inserted.error?.message)) {
          const localListing = saveLocalListing(user.id, { ...listing, source_url: sourceUrl, source: listing.source || "website" });
          if (resume) saveLocalMatch(user.id, resume.id, localListing.id, scores[index]);
          localCount += 1;
          continue;
        }
        onNotice(inserted.error?.message ?? "A listing was not saved."); continue;
      }
      savedCount += 1;
      if (resume) {
        saveLocalMatch(user.id, resume.id, inserted.data.id, scores[index]);
        await supabase.from("matches").upsert({ user_id: user.id, resume_id: resume.id, listing_id: inserted.data.id, score: scores[index]?.score ?? 0, explanation: scores[index]?.explanation ?? null }, { onConflict: "user_id,resume_id,listing_id" });
      }
    }
    const total = savedCount + localCount;
    onNotice(total ? `${total} opportunit${total === 1 ? "y" : "ies"} extracted and added to your workspace${localCount ? " locally" : ""}.` : "No opportunities could be saved.");
    setBusy(false); await onComplete();
  };
  return <div className="nexus-modal-backdrop"><div className="nexus-modal"><div className="flex items-start justify-between gap-4"><div><p className="nexus-eyebrow">Ingestion pipeline</p><h2 className="mt-2 text-xl font-semibold">Add an opportunity</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Paste a public careers page. Nexus extracts the roles, scores each one against your selected resume, and ranks the results by fit.</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div><div className="mt-6 space-y-4"><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground" htmlFor="listing-url">Website URL</label><Input id="listing-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://company.com/careers" autoFocus /></div><div className="space-y-2"><label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground" htmlFor="resume-select">Score with resume</label><select id="resume-select" value={resumeId} onChange={(event) => setResumeId(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Do not score yet</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.file_name}</option>)}</select>{resumes.length === 0 && <p className="text-xs text-muted-foreground">Upload a resume first to receive fit scores.</p>}</div></div><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => void ingest()} disabled={busy || !url.trim()}>{busy ? <><RefreshCw className="animate-spin" /> Processing</> : <><Sparkles /> Extract and score</>}</Button></div></div></div>;
}

function ProfileDialog({ user, onClose, onUpdated, onSignedOut }: { user: User; onClose: () => void; onUpdated: (user: User) => void; onSignedOut: () => void }) {
  const [name, setName] = useState(getDisplayName(user));
  const [saving, setSaving] = useState(false);
  const signOut = async () => { await supabase.auth.signOut(); onSignedOut(); };
  const saveName = async () => {
    const fullName = name.trim();
    if (!fullName) return;
    setSaving(true);
    const result = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (result.data.user) onUpdated(result.data.user);
    setSaving(false);
  };
  return <div className="nexus-profile-backdrop" onMouseDown={onClose}><div className="nexus-profile-panel" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="nexus-eyebrow">Profile</p><h2 className="mt-2 text-xl font-semibold">Your account</h2><p className="mt-1 text-sm text-muted-foreground">{user.email}</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div><div className="mt-6 space-y-2"><label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground" htmlFor="profile-name">Display name</label><Input id="profile-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveName(); }} /></div><div className="mt-6 flex items-center justify-between gap-2"><Button variant="outline" onClick={() => void signOut()}><LogOut /> Sign out</Button><Button onClick={() => void saveName()} disabled={saving || !name.trim()}>{saving ? "Saving..." : "Save name"}</Button></div></div></div>;
}

function AuthScreen({ mode, onModeChange }: { mode: "sign-in" | "sign-up"; onModeChange: (mode: "sign-in" | "sign-up") => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [sent, setSent] = useState(false);
  const submit = async () => { setBusy(true); setError(null); const result = mode === "sign-in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password }); if (result.error) setError(result.error.message); else if (mode === "sign-up") setSent(true); setBusy(false); };
  const google = async () => { const result = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); if (result.error) setError(result.error.message); };
  return <div className="nexus-auth min-h-screen bg-background"><div className="nexus-auth-grid" /><div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-5 py-10"><div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface/70 shadow-2xl lg:grid-cols-[1.1fr_.9fr]"><div className="hidden min-h-[560px] flex-col justify-between border-r border-border p-10 lg:flex"><div><p className="nexus-eyebrow mt-12">Career intelligence</p><h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight">Less scrolling. More signal.</h1><p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">Turn messy job listings into structured, personal, actionable opportunities.</p></div><div className="text-xs text-muted-foreground">Private by default · powered by your own workspace</div></div><div className="p-6 sm:p-10"><div className="mt-8 lg:mt-0"><p className="nexus-eyebrow">Your workspace</p><h2 className="mt-2 text-2xl font-semibold">{mode === "sign-in" ? "Welcome back" : "Create your workspace"}</h2><p className="mt-2 text-sm text-muted-foreground">{mode === "sign-in" ? "Pick up where your search left off." : "Start building a career search that remembers what matters."}</p></div>{sent ? <div className="mt-8 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-6 text-emerald-200">Check your email to confirm your account, then come back.</div> : <><div className="mt-8 space-y-3"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" /></div>{error && <p className="mt-3 text-sm text-red-300">{error}</p>}<Button className="mt-5 w-full" onClick={() => void submit()} disabled={busy || !email || !password}>{busy ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}</Button><div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" /></div><Button variant="outline" className="w-full" onClick={() => void google()}>Continue with Google</Button><p className="mt-6 text-center text-sm text-muted-foreground">{mode === "sign-in" ? "New here?" : "Already have an account?"} <button className="font-medium text-primary hover:underline" onClick={() => onModeChange(mode === "sign-in" ? "sign-up" : "sign-in")}>{mode === "sign-in" ? "Create one" : "Sign in"}</button></p></>}</div></div></div></div>;
}

function LoadingScreen() { return <div className="flex min-h-screen items-center justify-center bg-background"><RefreshCw className="size-5 animate-spin text-primary" /></div>; }
function Notice({ message, onClose }: { message: string; onClose: () => void }) { return <div className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm shadow-2xl"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" /><span className="flex-1 leading-6">{message}</span><button onClick={onClose} aria-label="Close notice"><X className="size-4 text-muted-foreground" /></button></div>; }

async function toggleShortlist(userId: string, listingId: string, exists: boolean) { if (exists) await supabase.from("shortlist_items").delete().eq("user_id", userId).eq("listing_id", listingId); else await supabase.from("shortlist_items").insert({ user_id: userId, listing_id: listingId, status: "saved" }); }
function localListingsKey(userId: string) { return `nexus-local-listings:${userId}`; }
function getLocalListings(userId: string): Listing[] {
  if (typeof window === "undefined") return [];
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(localListingsKey(userId)) ?? "[]");
    return Array.isArray(data) ? data as Listing[] : [];
  } catch { return []; }
}
function saveLocalListing(userId: string, listing: Database["public"]["Tables"]["listings"]["Insert"]) {
  const now = new Date().toISOString();
  const record: Listing = {
    id: crypto.randomUUID(),
    source: listing.source,
    source_listing_id: listing.source_listing_id ?? null,
    source_url: listing.source_url,
    title: listing.title,
    company: listing.company,
    location: listing.location ?? null,
    remote_ok: listing.remote_ok ?? false,
    stipend: listing.stipend ?? null,
    required_skills: listing.required_skills ?? [],
    experience_level: listing.experience_level ?? null,
    deadline: listing.deadline ?? null,
    description: listing.description ?? null,
    raw_text: listing.raw_text ?? null,
    extraction_status: listing.extraction_status ?? "ready",
    scraped_at: listing.scraped_at ?? now,
    created_at: now,
    updated_at: now,
  };
  const listings = getLocalListings(userId).filter((item) => item.source_url !== record.source_url);
  window.localStorage.setItem(localListingsKey(userId), JSON.stringify([record, ...listings]));
  return record;
}
function localMatchesKey(userId: string) { return `nexus-local-matches:${userId}`; }
function getLocalMatches(userId: string): Match[] {
  if (typeof window === "undefined") return [];
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(localMatchesKey(userId)) ?? "[]");
    return Array.isArray(data) ? data as Match[] : [];
  } catch { return []; }
}
function saveLocalMatch(userId: string, resumeId: string, listingId: string, value?: { score?: number; explanation?: string }) {
  const now = new Date().toISOString();
  const record: Match = { id: crypto.randomUUID(), user_id: userId, resume_id: resumeId, listing_id: listingId, score: value?.score ?? 0, explanation: value?.explanation ?? null, created_at: now, updated_at: now };
  const matches = getLocalMatches(userId).filter((item) => item.listing_id !== listingId || item.resume_id !== resumeId);
  window.localStorage.setItem(localMatchesKey(userId), JSON.stringify([record, ...matches]));
}
function localResumesKey(userId: string) { return `nexus-local-resumes:${userId}`; }
function getLocalResumes(userId: string): Resume[] {
  if (typeof window === "undefined") return [];
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(localResumesKey(userId)) ?? "[]");
    return Array.isArray(data) ? data as Resume[] : [];
  } catch { return []; }
}
function saveLocalResume(userId: string, fileName: string, storagePath: string, extractedText: string) {
  const now = new Date().toISOString();
  const record: Resume = { id: crypto.randomUUID(), user_id: userId, file_name: fileName, storage_path: storagePath, extracted_text: extractedText, skills: [], processing_status: "ready", processing_error: null, created_at: now, updated_at: now };
  const resumes = getLocalResumes(userId).filter((item) => item.file_name !== fileName);
  window.localStorage.setItem(localResumesKey(userId), JSON.stringify([record, ...resumes]));
  return record;
}
function chatHistoryKey(userId: string) { return `nexus-chat-history:${userId}`; }
function getChatHistory(userId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(chatHistoryKey(userId)) ?? "[]");
    return Array.isArray(data) ? data.filter((message): message is ChatMessage => Boolean(message) && typeof message === "object" && (message as ChatMessage).role !== undefined && typeof (message as ChatMessage).content === "string").slice(-40) : [];
  } catch { return []; }
}
function saveChatHistory(userId: string, history: ChatMessage[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(chatHistoryKey(userId), JSON.stringify(history.slice(-40)));
}
function isListingWritePolicyError(message?: string) { return Boolean(message && (/row-level security/i.test(message) || /permission denied/i.test(message))); }
function getDisplayName(user: User) { return typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email?.split("@")[0] ?? "there"; }
function getInitials(value: string) { return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
    const page = await document.getPage(index + 1);
    const content = await page.getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
  }));
  return pages.join("\n").replace(/\s+/g, " ").trim().slice(0, 30000);
}
