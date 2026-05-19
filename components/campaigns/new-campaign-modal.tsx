'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Search,
  X,
  Send,
  Clock,
  Lightbulb,
  Loader2,
  AlertCircle,
  Users,
  CalendarDays,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  subject: string;
  content: string;
}

interface ListSubscriberStatus {
  status: string;
  count: number;
}

interface List {
  id: string;
  name: string;
  description: string;
  _count: { subscribers: number };
  subscribers: ListSubscriberStatus[];
}

interface Domain {
  id: string;
  domain: string;
  status: 'VERIFIED' | 'PENDING' | 'FAILED';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Template' },
  { id: 2, label: 'Audience' },
  { id: 3, label: 'Compose' },
  { id: 4, label: 'Review & Send' },
];

const THUMB_GRADIENTS = [
  'from-[oklch(0.97_0.02_38)] to-[oklch(0.99_0.01_55)]',
  'from-[oklch(0.95_0.02_265)] to-[oklch(0.98_0.01_280)]',
  'from-[oklch(0.95_0.02_145)] to-[oklch(0.98_0.01_160)]',
  'from-[oklch(0.97_0.02_340)] to-[oklch(0.99_0.01_350)]',
  'from-[oklch(0.96_0.02_200)] to-[oklch(0.99_0.01_210)]',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGradient(index: number) {
  return THUMB_GRADIENTS[index % THUMB_GRADIENTS.length];
}

function getActiveCount(subscribers: ListSubscriberStatus[]) {
  return subscribers.find((s) => s.status === 'ACTIVE')?.count ?? 0;
}

function getActivePercent(list: List) {
  const total = list._count.subscribers;
  if (total === 0) return 0;
  return Math.round((getActiveCount(list.subscribers) / total) * 100);
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-start justify-center">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex w-[72px] flex-col items-center">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step.id < currentStep
                  ? 'bg-orange-500 text-white'
                  : step.id === currentStep
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step.id < currentStep ? <Check className="h-3.5 w-3.5" /> : step.id}
            </div>
            <span
              className={`mt-1 text-center text-[10px] font-semibold ${
                step.id < currentStep
                  ? 'text-orange-500'
                  : step.id === currentStep
                  ? 'text-gray-900'
                  : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mb-4 h-px w-8 ${
                step.id < currentStep ? 'bg-orange-300' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Template Selection ───────────────────────────────────────────────

function TemplateStep({
  templates,
  selected,
  onSelect,
  search,
  onSearch,
}: {
  templates: Template[];
  selected: string;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  const filtered = useMemo(
    () =>
      templates.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.subject.toLowerCase().includes(search.toLowerCase())
      ),
    [templates, search]
  );

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">Choose a Template</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Select the email template for this campaign
        </p>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search templates…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-4 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-14 text-center">
          <p className="text-sm text-gray-400">
            {templates.length === 0
              ? 'No templates yet. Create one first.'
              : 'No templates match your search.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {filtered.map((template, index) => {
            const isSelected = selected === template.id;
            return (
              <button
                key={template.id}
                onClick={() => onSelect(template.id)}
                className={`relative overflow-hidden rounded-lg border-2 bg-white text-left transition-all hover:shadow-sm ${
                  isSelected
                    ? 'border-orange-500 ring-2 ring-orange-100'
                    : 'border-[oklch(0.91_0.005_265)] hover:border-orange-200'
                }`}
              >
                {/* Gradient thumbnail top — matches /templates cards */}
                <div
                  className={`flex h-[90px] items-center justify-center bg-gradient-to-br ${getGradient(index)}`}
                >
                  <span className="text-4xl font-extrabold tracking-tight text-[oklch(0.65_0.19_38)]">
                    {template.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                {isSelected && (
                  <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
                {/* Info */}
                <div className="p-3.5">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {template.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-400">
                    {template.subject}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Audience Selection ───────────────────────────────────────────────

function AudienceStep({
  lists,
  selected,
  onSelect,
}: {
  lists: List[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">Choose Your Audience</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Select the subscriber list to send this campaign to
        </p>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-14 text-center">
          <p className="text-sm text-gray-400">
            No lists yet. Create a subscriber list first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {lists.map((list) => {
            const isSelected = selected === list.id;
            const total = list._count.subscribers;
            const active = getActiveCount(list.subscribers);
            const pct = getActivePercent(list);

            return (
              <button
                key={list.id}
                onClick={() => onSelect(list.id)}
                className={`relative rounded-lg border-2 bg-white p-4 text-left transition-all hover:shadow-sm ${
                  isSelected
                    ? 'border-orange-500 ring-2 ring-orange-100'
                    : 'border-gray-100 hover:border-orange-200'
                }`}
              >
                {isSelected && (
                  <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}

                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                  <Users className="h-5 w-5 text-gray-500" />
                </div>

                <p className="text-sm font-semibold text-gray-900">{list.name}</p>

                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {total.toLocaleString()} contacts
                  </span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                      pct >= 70
                        ? 'bg-[#197e29] text-white'
                        : pct >= 40
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {pct}% active
                  </span>
                </div>

                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded ${
                      pct >= 70
                        ? 'bg-[#197e29]'
                        : pct >= 40
                        ? 'bg-yellow-400'
                        : 'bg-red-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <p className="mt-1.5 text-xs text-gray-400">
                  {active.toLocaleString()} active subscribers
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Compose ──────────────────────────────────────────────────────────

function ComposeStep({
  domains,
  campaignName,
  setCampaignName,
  fromName,
  setFromName,
  replyTo,
  setReplyTo,
  selectedDomain,
  setSelectedDomain,
  fromEmailLocal,
  setFromEmailLocal,
  subject,
  setSubject,
  onVerifyDomain,
}: {
  domains: Domain[];
  campaignName: string;
  setCampaignName: (v: string) => void;
  fromName: string;
  setFromName: (v: string) => void;
  replyTo: string;
  setReplyTo: (v: string) => void;
  selectedDomain: string;
  setSelectedDomain: (v: string) => void;
  fromEmailLocal: string;
  setFromEmailLocal: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  onVerifyDomain: () => void;
}) {
  const fromEmail =
    fromEmailLocal && selectedDomain
      ? `${fromEmailLocal}@${selectedDomain}`
      : '';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Compose</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Configure sender details and subject line
        </p>
      </div>

      {/* Campaign name */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Campaign Name
        </label>
        <input
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="e.g. June Newsletter"
          className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
        <p className="mt-0.5 text-xs text-gray-400">
          Internal reference — not shown to recipients
        </p>
      </div>

      {/* Sender Identity */}
      <div className="rounded-lg border border-[#e8e4df] bg-[#f5f3f0] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Sender Identity
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Sender Name
              </label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="e.g. Acme Inc."
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Reply-To Email
              </label>
              <input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="e.g. hello@gmail.com"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              From Email
            </label>
            {domains.length === 0 ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                <div>
                  <p className="text-sm text-yellow-800">No verified domains.</p>
                  <button
                    onClick={onVerifyDomain}
                    className="mt-0.5 text-xs font-medium text-yellow-700 underline"
                  >
                    Verify a domain →
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white">
                <input
                  type="text"
                  value={fromEmailLocal}
                  onChange={(e) =>
                    setFromEmailLocal(e.target.value.split('@')[0])
                  }
                  placeholder="hello"
                  className="h-9 flex-1 border-0 px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-0"
                />
                <div className="flex items-center border-l border-gray-200 bg-[#f5f3f0] px-2">
                  <span className="text-sm text-gray-400">@</span>
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="h-9 border-0 bg-transparent pl-1 pr-2 text-sm text-gray-700 focus:outline-none focus:ring-0"
                  >
                    {domains.map((d) => (
                      <option key={d.id} value={d.domain}>
                        {d.domain}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {domains.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                Only verified domains are available ·{' '}
                <button
                  onClick={onVerifyDomain}
                  className="text-blue-800 cursor-pointer"
                >
                  Manage domains →
                </button>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Subject Line
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Exciting news for you 🎉"
          className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
        />
      </div>

      {/* Inbox preview */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Inbox Preview
          </p>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{ backgroundColor: '#fef3c7', color: '#d97706' }}
            >
              {fromName ? fromName.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {fromName || 'Sender Name'}
                </p>
                <span className="shrink-0 text-xs text-gray-400">Just now</span>
              </div>
              <p className="mt-0.5 truncate text-sm text-gray-700">
                {subject || 'Your subject line will appear here'}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-400">
                {fromEmailLocal && selectedDomain
                  ? `${fromEmailLocal}@${selectedDomain}`
                  : 'hello@yourdomain.com'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Personalization tip */}
      <div className="flex items-start gap-2.5 rounded-lg border border-[#a8dff0] bg-[#e3f9ff] p-3.5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#0284c7]" />
        <div>
          <p className="text-xs font-semibold text-[#0c4a6e]">
            Personalization tip
          </p>
          <p className="mt-0.5 text-xs text-[#0369a1]">
            Use{' '}
            <code className="rounded bg-[#bae6fd] px-1 font-mono">
              {'{{firstName}}'}
            </code>{' '}
            in your subject line to increase open rates by up to 26%.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Review & Send ────────────────────────────────────────────────────

function ReviewStep({
  selectedTemplate,
  selectedList,
  campaignName,
  fromName,
  replyTo,
  fromEmail,
  subject,
  sendOption,
  setSendOption,
  scheduleDate,
  setScheduleDate,
  scheduleTime,
  setScheduleTime,
  onEdit,
}: {
  selectedTemplate: Template | undefined;
  selectedList: List | undefined;
  campaignName: string;
  fromName: string;
  replyTo: string;
  fromEmail: string;
  subject: string;
  sendOption: 'now' | 'schedule';
  setSendOption: (v: 'now' | 'schedule') => void;
  scheduleDate: string;
  setScheduleDate: (v: string) => void;
  scheduleTime: string;
  setScheduleTime: (v: string) => void;
  onEdit: (step: number) => void;
}) {
  const summaryRows = [
    { label: 'Campaign', value: campaignName || '—', step: 3 },
    { label: 'Template', value: selectedTemplate?.name ?? '—', step: 1 },
    { label: 'Audience', value: selectedList?.name ?? '—', step: 2 },
    { label: 'Subject', value: subject || '—', step: 3 },
    { label: 'From', value: fromEmail || '—', step: 3 },
    { label: 'Reply-To', value: replyTo || '—', step: 3 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Review & Send</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Check everything looks good before sending
        </p>
      </div>

      {/* Summary table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <p className="text-xs font-bold text-gray-700">Campaign Summary</p>
        </div>
        <div className="divide-y divide-gray-50 bg-white">
          {summaryRows.map((row) => (
            <div key={row.label} className="flex items-center px-5 py-3">
              <span className="w-24 shrink-0 text-sm font-medium text-gray-500">
                {row.label}
              </span>
              <span className="flex-1 truncate text-sm text-gray-900">
                {row.value}
              </span>
              <button
                onClick={() => onEdit(row.step)}
                className="ml-4 shrink-0 text-xs font-semibold cursor-pointer text-orange-500 hover:text-orange-600"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* When to send */}
      <div>
        <p className="mb-3 text-sm font-bold text-gray-900">When to send?</p>
        <div className="space-y-2.5">
          {/* Send now */}
          <label
            className={`flex cursor-pointer items-start gap-3.5 rounded-lg border-2 p-4 transition-all ${
              sendOption === 'now'
                ? 'border-orange-500 bg-orange-50'
                : 'border-gray-100 bg-white hover:border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="send-option"
              value="now"
              checked={sendOption === 'now'}
              onChange={() => setSendOption('now')}
              className="sr-only"
            />
            <div
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                sendOption === 'now' ? 'border-orange-500' : 'border-gray-300'
              }`}
            >
              {sendOption === 'now' && (
                <div className="h-2 w-2 rounded-full bg-orange-500" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5 text-gray-600" />
                <span className="text-sm font-semibold text-gray-900">
                  Send now
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                Campaign will be sent immediately after confirmation
              </p>
            </div>
          </label>

          {/* Schedule */}
          <label
            className={`flex cursor-pointer items-start gap-3.5 rounded-lg border-2 p-4 transition-all ${
              sendOption === 'schedule'
                ? 'border-orange-500 bg-orange-50'
                : 'border-gray-100 bg-white hover:border-gray-200'
            }`}
          >
            <input
              type="radio"
              name="send-option"
              value="schedule"
              checked={sendOption === 'schedule'}
              onChange={() => setSendOption('schedule')}
              className="sr-only"
            />
            <div
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                sendOption === 'schedule' ? 'border-orange-500' : 'border-gray-300'
              }`}
            >
              {sendOption === 'schedule' && (
                <div className="h-2 w-2 rounded-full bg-orange-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-gray-600" />
                <span className="text-sm font-semibold text-gray-900">
                  Schedule for later
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                Pick a date and time to send your campaign
              </p>
              {sendOption === 'schedule' && (
                <div className="mt-3 flex gap-2.5">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                  />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              )}
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface NewCampaignModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewCampaignModal({ open, onClose, onCreated }: NewCampaignModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Remote data
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');

  // Step 2
  const [selectedListId, setSelectedListId] = useState('');

  // Step 3
  const [campaignName, setCampaignName] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [fromEmailLocal, setFromEmailLocal] = useState('');
  const [subject, setSubject] = useState('');

  // Step 4
  const [sendOption, setSendOption] = useState<'now' | 'schedule'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );
  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId),
    [lists, selectedListId]
  );
  const fromEmail =
    fromEmailLocal && selectedDomain
      ? `${fromEmailLocal}@${selectedDomain}`
      : '';

  // Fetch data when modal opens
  useEffect(() => {
    if (!open) return;
    setDataLoading(true);
    Promise.all([fetchTemplates(), fetchLists(), fetchDomains()]).finally(() =>
      setDataLoading(false)
    );
  }, [open]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedTemplateId('');
      setTemplateSearch('');
      setSelectedListId('');
      setCampaignName('');
      setFromName('');
      setReplyTo('');
      setSelectedDomain('');
      setFromEmailLocal('');
      setSubject('');
      setSendOption('now');
      setScheduleDate('');
      setScheduleTime('');
      setError('');
    }
  }, [open]);

  // Auto-populate subject from selected template
  useEffect(() => {
    if (selectedTemplate && !subject) {
      setSubject(selectedTemplate.subject);
    }
  }, [selectedTemplate]);

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch {}
  }

  async function fetchLists() {
    try {
      const res = await fetch('/api/lists');
      if (res.ok) {
        const data = await res.json();
        setLists(data.lists || []);
      }
    } catch {}
  }

  async function fetchDomains() {
    try {
      const res = await fetch('/api/domains');
      if (res.ok) {
        const data = await res.json();
        const verified = (data.domains || []).filter(
          (d: Domain) => d.status === 'VERIFIED'
        );
        setDomains(verified);
        if (verified.length > 0) {
          setSelectedDomain(verified[0].domain);
        }
      }
    } catch {}
  }

  function canProceed() {
    if (step === 1) return !!selectedTemplateId;
    if (step === 2) return !!selectedListId;
    if (step === 3) {
      return !!(
        campaignName.trim() &&
        fromName.trim() &&
        replyTo.trim() &&
        selectedDomain &&
        fromEmailLocal.trim() &&
        subject.trim()
      );
    }
    if (step === 4) {
      if (sendOption === 'schedule') return !!(scheduleDate && scheduleTime);
      return true;
    }
    return false;
  }

  function handleVerifyDomain() {
    onClose();
    router.push('/domains/verify');
  }

  async function handleSaveAsDraft() {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          subject,
          content: selectedTemplate?.content ?? '',
          listId: selectedListId,
          templateId: selectedTemplateId,
          fromEmail,
          fromName,
          replyTo,
        }),
      });
      if (res.ok) {
        onClose();
        onCreated();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to save draft');
      }
    } catch {
      setError('An error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend() {
    setError('');
    setSubmitting(true);
    try {
      const scheduleAt =
        sendOption === 'schedule' && scheduleDate && scheduleTime
          ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
          : undefined;

      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          subject,
          content: selectedTemplate?.content ?? '',
          listId: selectedListId,
          templateId: selectedTemplateId,
          fromEmail,
          fromName,
          replyTo,
          scheduledAt: scheduleAt,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        setError(err.error || 'Failed to create campaign');
        return;
      }

      const { campaign } = await createRes.json();

      const sendRes = await fetch(`/api/campaigns/${campaign.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleAt }),
      });

      if (!sendRes.ok) {
        const err = await sendRes.json();
        setError(err.error || 'Failed to send campaign');
        return;
      }

      onClose();
      onCreated();
    } catch {
      setError('An error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-4xl flex-col rounded-2xl bg-[#fcfcfa] shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-8 py-5">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h1 className="text-base font-bold text-gray-900">New Campaign</h1>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="shrink-0 border-b border-gray-100 px-8 py-4">
          <Stepper currentStep={step} />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {dataLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
            </div>
          ) : (
            <>
              {step === 1 && (
                <TemplateStep
                  templates={templates}
                  selected={selectedTemplateId}
                  onSelect={setSelectedTemplateId}
                  search={templateSearch}
                  onSearch={setTemplateSearch}
                />
              )}
              {step === 2 && (
                <AudienceStep
                  lists={lists}
                  selected={selectedListId}
                  onSelect={setSelectedListId}
                />
              )}
              {step === 3 && (
                <ComposeStep
                  domains={domains}
                  campaignName={campaignName}
                  setCampaignName={setCampaignName}
                  fromName={fromName}
                  setFromName={setFromName}
                  replyTo={replyTo}
                  setReplyTo={setReplyTo}
                  selectedDomain={selectedDomain}
                  setSelectedDomain={setSelectedDomain}
                  fromEmailLocal={fromEmailLocal}
                  setFromEmailLocal={setFromEmailLocal}
                  subject={subject}
                  setSubject={setSubject}
                  onVerifyDomain={handleVerifyDomain}
                />
              )}
              {step === 4 && (
                <ReviewStep
                  selectedTemplate={selectedTemplate}
                  selectedList={selectedList}
                  campaignName={campaignName}
                  fromName={fromName}
                  replyTo={replyTo}
                  fromEmail={fromEmail}
                  subject={subject}
                  sendOption={sendOption}
                  setSendOption={setSendOption}
                  scheduleDate={scheduleDate}
                  setScheduleDate={setScheduleDate}
                  scheduleTime={scheduleTime}
                  setScheduleTime={setScheduleTime}
                  onEdit={setStep}
                />
              )}

              {error && (
                <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-8 py-5">
          <button
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {step === 1 ? 'Cancel' : (
              <>
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </>
            )}
          </button>

          <div className="flex items-center gap-2.5">
            {step === 4 && (
              <button
                onClick={handleSaveAsDraft}
                disabled={submitting}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Clock className="h-3.5 w-3.5 bg-[#f5f3f0]-400" />
                Save as Draft
              </button>
            )}

            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                Continue
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canProceed() || submitting}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : sendOption === 'schedule' ? (
                  <CalendarDays className="h-3.5 w-3.5" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {submitting
                  ? 'Sending…'
                  : sendOption === 'schedule'
                  ? 'Schedule Campaign'
                  : 'Send Campaign'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
