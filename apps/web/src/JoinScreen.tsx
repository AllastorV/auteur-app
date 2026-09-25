import React, { useEffect, useMemo, useState } from 'react';
import { t } from '@storyboard/core';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  connectSession,
  sessionApi,
  useCollabStore,
  useProjectStore,
  type Role,
} from '@storyboard/core';
import * as Y from 'yjs';
import { serverUrlFromQueryIsForeign, webPlatform } from './platform';

export interface JoinResult {
  role: Role;
  projectName: string;
}

/**
 * OTURUM JETONUNUN YEREL ANAHTARI — ODA BAŞINA.
 *
 * Neden davet jetonu DEĞİL: davet tek kullanımlıktır ve bu bilinçlidir.
 * Sunucuda sayaç (`kullanim >= kullanimSiniri`) tam da sızan bir bağlantıyla
 * sınırsız kişinin girebildiği hata yüzünden konmuştu. Davet linki
 * mesajlaşmadan, e-postadan, ekran görüntüsünden geçer; onu kalıcı yapmak o
 * deliği geri açardı. Davet KAPIDAKİ BİLET, oturum jetonu BİLEKLİK.
 *
 * Oda başına ayrı anahtar: aynı tarayıcıdan iki farklı odaya girilebiliyor ve
 * tek anahtar ikincisini birincinin üstüne yazardı.
 */
const oturumAnahtari = (kod: string) => `storyboard:oturum:${kod.trim().toUpperCase()}`;

/** Davet linkinden ya da oda kodundan oturuma katılma ekranı. */
export function JoinScreen({ onJoined }: { onJoined: (r: JoinResult) => void }) {
  const params = new URLSearchParams(location.search);
  const [serverUrl, setServerUrl] = useState(webPlatform.defaultServerUrl());
  const [code, setCode] = useState(params.get('oda') ?? '');
  const [token, setToken] = useState(params.get('davet') ?? '');
  const [name, setName] = useState(localStorage.getItem('storyboard:name') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  const join = React.useCallback(async () => {
    const saklanan = code.trim() ? localStorage.getItem(oturumAnahtari(code)) : null;
    if (!code.trim() || !(token.trim() || saklanan)) {
      setError(t('Oda kodu ve davet token’ı gerekli. Davet linkini olduğu gibi açın.'));
      return;
    }
    if (!name.trim()) {
      setError(t('Lütfen görünecek adınızı girin.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dene = (jeton: string) => sessionApi.joinByCode(serverUrl, {
        code: code.trim(),
        token: jeton,
        name: name.trim(),
      });

      /* SAKLANAN OTURUM ÖNCE, davet sonra. Sunucu `kind: 'session'` jetonunu
         `joinRoom`da zaten kabul ediyor ve davet sayacına HİÇ bakmıyor —
         mekanizma kuruluydu, istemci jetonu atıyordu.

         Başarısızlıkta saklanan SİLİNİYOR: süresi dolmuş ya da iptal edilmiş
         bir jeton kalıcı olsaydı kullanıcı kendi tarayıcısında kilitlenirdi
         ve elindeki geçerli davet de işe yaramazdı. Silip davete düşmek, tek
         çıkışı olan bir çıkmaz sokağı önlüyor. */
      let res;
      try {
        res = await dene(saklanan ?? token.trim());
      } catch (ilk) {
        if (!saklanan || !token.trim()) throw ilk;
        localStorage.removeItem(oturumAnahtari(code));
        res = await dene(token.trim());
      }
      localStorage.setItem('storyboard:name', name.trim());
      /* Sunucunun döndürdüğü ODA KODUYLA yazılıyor, kullanıcının yazdığıyla
         değil: küçük harfle ya da tireyi unutarak girilen kod da aynı odaya
         düşüyor ve iki ayrı anahtar üretilmemeli. */
      localStorage.setItem(oturumAnahtari(res.roomCode), res.sessionToken);

      const store = useProjectStore.getState();
      // Sunucudaki doküman yetkilidir; boş bir dokümanla bağlanılır ve
      // içerik ilk senkron adımında sunucudan gelir.
      const doc = new Y.Doc();
      store.attachDoc(doc, res.role as Role);

      useCollabStore.getState().setIdentity(res.userId, res.userName);
      useCollabStore.getState().setRole(res.role as Role);
      useCollabStore.getState().setSession({
        roomId: res.roomId,
        roomCode: res.roomCode,
        serverUrl,
        inviteUrl: location.href,
        projectName: res.projectName,
      });

      connectSession({
        serverUrl: res.wsUrl,
        /* Tazelenen jeton saklanana da yazılıyor: yenilemeden sonra geri
           girmek için kullanılan jeton da böylece taze kalıyor. */
        apiUrl: serverUrl,
        onJeton: (j) => localStorage.setItem(oturumAnahtari(res.roomCode), j),
        roomId: res.roomId,
        sessionToken: res.sessionToken,
        userId: res.userId,
        userName: res.userName,
        doc,
      });

      onJoined({ role: res.role as Role, projectName: res.projectName });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [code, token, name, serverUrl, onJoined]);

  // Link tam ise ve ad kayıtlıysa doğrudan katıl. Ancak `?sunucu=` linkle
  // gelip başka bir kaynağı gösteriyorsa otomatik katılma: hazırlanmış bir
  // link davet token'ını ve proje dokümanını yabancı bir sunucuya gönderir.
  const foreignServer = useMemo(() => serverUrlFromQueryIsForeign(), []);
  useEffect(() => {
    if (autoTried) return;
    setAutoTried(true);
    if (foreignServer) {
      setError(
        t('Bu link farklı bir sunucu adresi içeriyor. Adresi kontrol edip katılmayı elle onaylayın.'),
      );
      return;
    }
    /* SAKLANAN OTURUM da otomatik katılmaya yetiyor — davet linki
       gerekmiyor. Yenileme tam olarak bu yoldan geri giriyor; öncesinde
       yenileyen kullanıcı katılma ekranına düşüyor ve formdaki TÜKENMİŞ
       davet jetonu ona "çalışacak" izlenimi veriyordu. */
    const oda = params.get('oda');
    const saklananVar = oda ? Boolean(localStorage.getItem(oturumAnahtari(oda))) : false;
    if (oda && (params.get('davet') || saklananVar) && localStorage.getItem('storyboard:name')) {
      void join();
    }
  }, [autoTried, join, params, foreignServer]);

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-200">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <h1 className="text-lg font-semibold text-slate-100">Auteur</h1>
        <p className="mt-1 text-xs text-slate-400">
          {t('Ortak çalışma oturumuna katılın. Kurulum gerekmez — tarayıcıdan çalışır.')}
        </p>

        <div className="mt-5 space-y-3">
          <Field label={t('Adınız')}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Görünecek ad')}
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-1"
            />
          </Field>
          <Field label={t('Oda kodu')}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC-123"
              className="w-full rounded bg-slate-800 px-3 py-2 font-mono text-sm tracking-widest outline-none"
            />
          </Field>
          <Field label={t('Davet token’ı')}>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t('Davet linkindeki token')}
              className="w-full rounded bg-slate-800 px-3 py-2 font-mono text-[11px] outline-none"
            />
          </Field>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">{t('Sunucu adresi')}</summary>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="mt-2 w-full rounded bg-slate-800 px-3 py-2 text-xs outline-none"
            />
          </details>

          {error && <p className="rounded bg-rose-950/60 px-3 py-2 text-xs text-rose-200">{error}</p>}

          <button
            type="button"
            onClick={join}
            disabled={busy}
            className="w-full rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? t('Bağlanılıyor…') : t('Oturuma katıl')}
          </button>
        </div>

        <div className="mt-5 border-t border-slate-800 pt-4 text-[11px] text-slate-500">
          <p className="mb-1 font-semibold text-slate-400">{t('Roller')}</p>
          <ul className="space-y-0.5">
            {(['owner', 'editor', 'commenter', 'viewer'] as Role[]).map((r) => (
              <li key={r}>
                <strong className="text-slate-300">{t(ROLE_LABELS[r])}</strong> — {t(ROLE_DESCRIPTIONS[r])}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
