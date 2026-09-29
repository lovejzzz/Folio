import { isConfigured, type ProviderId } from '@folio/ai';
import { Button, Dialog, SegmentedControl } from '@folio/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { probeModel } from '../../components/ConnectDialog';
import { ProviderChoice, ProviderFields, hasKey, missingSetup } from '../../components/ProviderFields';
import { useT } from '../../i18n';
import { download } from '../../lib/exporter';
import { allCourses, deleteCourse, listCourses, storageKept } from '../../state/db';
import { errorMessage } from '../../state/model';
import { modelSettings, usePrefs } from '../../state/prefs';
import { dropSession } from '../../state/session';
import { toast } from '../../state/toasts';
import { AccountSection } from './AccountSection';

function Section({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <section className="rounded-sheet bg-paper p-6 shadow-sheet md:p-8">
      <h2 className="font-display text-28 leading-tight text-ink">{title}</h2>
      {lede && <p className="mt-1 max-w-xl font-ui text-14 leading-relaxed text-ink-2">{lede}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule py-3 first:border-t-0 first:pt-0">
      <span className="font-ui text-14 text-ink">{label}</span>
      {children}
    </div>
  );
}

/** Which provider Folio is using, when it isn't the one on screen. */
function ActiveNote({ provider }: { provider: ProviderId }) {
  const t = useT();
  const active = usePrefs((s) => s.provider);
  const activeReady = usePrefs((s) => isConfigured(modelSettings(s)));
  if (!active || active === provider || !activeReady) return null;
  return <p className="mt-3 font-ui text-13 text-ink-2">{t.settings.stillUsing(t.settings.providers[active].short, provider === 'local')}</p>;
}

function ModelSection() {
  const t = useT();
  const navigate = useNavigate();
  const prefs = usePrefs();
  const [provider, setProvider] = useState<ProviderId>(prefs.provider ?? 'anthropic');
  const [status, setStatus] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: false });
  const test = async () => {
    const missing = missingSetup(provider, t);
    if (missing) return setStatus({ busy: false, message: missing, ok: false });
    setStatus({ busy: true, message: null, ok: false });
    try {
      await probeModel(provider);
      prefs.set({ provider });
      setStatus({ busy: false, message: t.settings.testOk, ok: true });
    } catch (error) {
      setStatus({ busy: false, message: errorMessage(error, provider), ok: false });
    }
  };
  // Choosing a provider only looks at it; Folio switches once it has a key (or, for a local server, once it connects).
  const choose = (p: ProviderId) => {
    setProvider(p);
    if (hasKey(p)) prefs.set({ provider: p });
    setStatus({ busy: false, message: null, ok: false });
  };
  return (
    <Section title={t.settings.ai} lede={t.settings.aiLede}>
      <ProviderChoice value={provider} onChange={choose} />
      <div className="mt-6 max-w-md">
        <ProviderFields provider={provider} onKey={(key) => key && prefs.set({ provider })} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {status.ok && (
            <Button variant="primary" onPress={() => void navigate({ to: '/' })}>
              {t.settings.done}
            </Button>
          )}
          <Button variant={status.ok ? 'secondary' : 'primary'} isDisabled={status.busy} onPress={() => void test()}>
            {status.busy ? t.settings.testing : t.settings.test}
          </Button>
          {provider !== 'local' && prefs.keys[provider] && (
            <Button variant="quiet" onPress={() => prefs.set({ keys: { ...prefs.keys, [provider]: '' } })}>
              {t.settings.forget}
            </Button>
          )}
        </div>
        {status.message && (
          <p role="status" className={status.ok ? 'mt-3 font-ui text-13 text-good' : 'mt-3 font-ui text-13 text-critical'}>
            {status.message}
          </p>
        )}
        <ActiveNote provider={provider} />
      </div>
    </Section>
  );
}

function AppearanceSection() {
  const t = useT();
  const { theme, density, set } = usePrefs();
  return (
    <Section title={t.settings.appearance}>
      <Row label={t.settings.theme}>
        <SegmentedControl label={t.settings.theme} value={theme} onChange={(v) => set({ theme: v })} options={[{ id: 'system', label: t.nav.themeSystem }, { id: 'light', label: t.nav.themeLight }, { id: 'dark', label: t.nav.themeDark }]} />
      </Row>
      <Row label={t.settings.density}>
        <SegmentedControl label={t.settings.density} value={density} onChange={(v) => set({ density: v })} options={[{ id: 'comfortable', label: t.map.comfortable }, { id: 'compact', label: t.map.compact }]} />
      </Row>
    </Section>
  );
}

function DataSection() {
  const t = useT();
  const [used, setUsed] = useState<string | null>(null);
  const [kept, setKept] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsed(e.usage ? size(e.usage) : null));
    void storageKept().then(setKept);
  }, []);
  const saveAll = async () => {
    const { writeFolio, zipFiles, slugFilename } = await import('@folio/export');
    const courses = await allCourses();
    const files = courses.map((c) => ({ name: slugFilename(c.title, '', '', 'folio'), bytes: writeFolio(c) }));
    download({ name: t.settings.backupAllName, mime: 'application/zip', bytes: zipFiles(files) });
  };
  return (
    <Section title={t.settings.data} lede={t.settings.dataLede}>
      {used && <p className="mb-4 font-ui text-13 text-ink-2">{t.settings.storage(used)}</p>}
      {kept === false && <p className="mb-4 font-ui text-13 text-attention">{t.settings.notKept}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onPress={() => void saveAll()}>{t.settings.exportAll}</Button>
        <Button variant="quiet" className="text-critical" onPress={() => setConfirm(true)}>
          {t.settings.deleteAll}
        </Button>
      </div>
      <p className="mt-6 font-ui text-13 text-ink-2">{t.settings.accountNote}</p>
      <p className="mt-2 flex flex-wrap gap-x-5 font-ui text-13">
        <Link to="/privacy" className="text-accent underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
          {t.privacy.title}
        </Link>
        <a href="/fonts-licence.txt" className="text-accent underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
          {t.settings.fontsLicence}
        </a>
      </p>
      <Dialog isOpen={confirm} onOpenChange={setConfirm} title={t.settings.deleteAll} size="sm">
        <div className="px-6 pb-6">
          <p className="mt-2 font-ui text-14 text-ink-2">{t.settings.deleteAllConfirm}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" onPress={() => setConfirm(false)}>{t.common.cancel}</Button>
            <Button
              variant="destructive"
              onPress={async () => {
                dropSession();
                // One by one, so a signed-in account deletes its copies too.
                for (const c of await listCourses()) await deleteCourse(c.id);
                setConfirm(false);
                toast({ message: t.library.deleted });
              }}
            >
              {t.common.delete}
            </Button>
          </div>
        </div>
      </Dialog>
    </Section>
  );
}

/** One page, not a modal maze. */
/** "40 KB" or "3.2 MB": small sizes never read as "0.0 MB". */
function size(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export function Settings() {
  const t = useT();
  usePageTitle(t.settings.title);
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-5 pb-24 pt-8 md:pt-12">
        <h1 className="font-display text-48 leading-none text-ink">{t.settings.title}</h1>
        <AccountSection Section={Section} />
        <ModelSection />
        <AppearanceSection />
        <DataSection />
      </main>
    </div>
  );
}
