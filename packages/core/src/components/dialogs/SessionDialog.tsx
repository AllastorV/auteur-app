import React, { useCallback, useEffect, useState } from 'react';
import { t, tf } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { useProjectStore } from '../../store/project';
import { useCollabStore } from '../../store/collab';
import { useUiStore } from '../../store/ui';
import { usePlatform } from '../../platform/context';
import { sessionApi } from '../../collab/api';
import { connectSession, disconnectSession } from '../../collab/client';
import { ROLES } from '../../model/permissions';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '../../model/types';
import type { InviteResponse } from '../../collab/protocol';
import { uid } from '../../util/id';
import { Ikon } from '../Ikon';

/** Adres yalnız BU makineden erişilebilir mi (geri döngü). */
function geriDonguMu(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch {
    /* Ayrıştırılamayan adres de paylaşılamaz sayılıyor: kullanıcıyı yanlış
       yönde rahatlatmaktansa fazladan uyarmak yeğ. */
    return true;
  }
}

/** Oturum başlatma, davet linki üretme ve rol yönetimi. */
export function SessionDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const project = useProjectStore((s) => s.project);
  const doc = useProjectStore((s) => s.doc);
  const setProjectRole = useProjectStore((s) => s.setRole);
  const collab = useCollabStore();
  const showToast = useUiStore((s) => s.showToast);

  const [serverUrl, setServerUrl] = useState(platform.defaultServerUrl());
  const [userName, setUserName] = useState(collab.userName || project.meta.author || t('Sahip'));
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [invites, setInvites] = useState<(InviteResponse & { revoked?: boolean })[]>([]);
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [expiry, setExpiry] = useState(1440);
  /* Varsayılan TEK KİŞİ: davet jetonu adres satırında taşınıyor ve adres
     tarayıcı geçmişine düşüyor. Sızan bir bağlantının süresiz çalışması
     "linki bulan girer" demekti. Sahip birden çok kişiyi çağıracaksa sayıyı
     AÇIKÇA yükseltir — sessiz bir varsayılan olarak açık bırakılmıyor. */
  const [kullanimSiniri, setKullanimSiniri] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = collab.status === 'connected' && collab.session;

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await sessionApi.create(serverUrl, {
        projectName: project.meta.name,
        ownerName: userName,
      });
      setOwnerToken(res.ownerToken);
      const userId = uid('usr');
      useCollabStore.getState().setIdentity(userId, userName);
      useCollabStore.getState().setSession({
        roomId: res.roomId,
        roomCode: res.roomCode,
        serverUrl,
        inviteUrl: res.inviteUrl,
        projectName: project.meta.name,
      });
      useCollabStore.getState().setRole('owner');
      setProjectRole('owner');
      connectSession({
        serverUrl: res.wsUrl,
        roomId: res.roomId,
        sessionToken: res.ownerToken,
        userId,
        userName,
        doc,
      });
      showToast(t('Oturum başlatıldı. Davet linkini paylaşabilirsiniz.'), 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [serverUrl, project.meta.name, userName, doc, setProjectRole, showToast]);

  const createInvite = useCallback(async () => {
    if (!collab.session || !ownerToken) return;
    setBusy(true);
    setError(null);
    try {
      const invite = await sessionApi.invite(serverUrl, collab.session.roomId, ownerToken, {
        role: inviteRole,
        expiresInMinutes: expiry,
        kullanimSiniri,
      });
      setInvites((prev) => [invite, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [collab.session, ownerToken, serverUrl, inviteRole, expiry, kullanimSiniri]);

  const refreshInvites = useCallback(async () => {
    if (!collab.session || !ownerToken) return;
    try {
      const res = await sessionApi.listInvites(serverUrl, collab.session.roomId, ownerToken);
      setInvites(res.invites);
    } catch {
      /* liste alınamadı — sessiz geç */
    }
  }, [collab.session, ownerToken, serverUrl]);

  useEffect(() => {
    if (connected) void refreshInvites();
  }, [connected, refreshInvites]);

  const changeRole = useCallback(
    async (userId: string, role: Role) => {
      if (!collab.session || !ownerToken) return;
      try {
        await sessionApi.setRole(serverUrl, collab.session.roomId, ownerToken, { userId, role });
        showToast(tf('Rol güncellendi: %s', t(ROLE_LABELS[role])), 'success');
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [collab.session, ownerToken, serverUrl, showToast],
  );

  const end = useCallback(async () => {
    if (collab.session && ownerToken) {
      try {
        await sessionApi.close(serverUrl, collab.session.roomId, ownerToken);
      } catch {
        /* sunucu zaten kapatmış olabilir */
      }
    }
    disconnectSession();
    setOwnerToken(null);
    setInvites([]);
    showToast(t('Oturum kapatıldı. Proje yerelde açık kalmaya devam ediyor.'), 'info');
  }, [collab.session, ownerToken, serverUrl, showToast]);

  return (
    <Modal
      title={t('Ortak Çalışma Oturumu')}
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>{t('Kapat')}</Button>
          {connected ? (
            <Button variant="danger" onClick={end}>
              {t('Oturumu kapat')}
            </Button>
          ) : (
            <Button variant="primary" onClick={start} disabled={busy}>
              {t('Oturum başlat')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="bg-rose-950/60 px-3 py-2 text-xs text-rose-200">{error}</p>}

        {!connected && (
          <>
            <Field label={t('Sunucu adresi')}>
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
                placeholder="http://localhost:5180"
              />
              <p className="mt-1 text-[10px] text-metin-etiket">
                {t('Davetliler bu sunucu üzerinden internet üzerinden bağlanır; kurulum gerekmez.')}
              </p>
            </Field>
            <Field label={t('Adınız')}>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
              />
            </Field>
          </>
        )}

        {connected && collab.session && (
          <>
            <div className="border border-amber-kenar bg-amber-zemin p-3">
              <p className="text-[11px] uppercase tracking-wide text-amber">{t('Oda kodu')}</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-amber">
                {collab.session.roomCode}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={collab.session.inviteUrl}
                  className="min-w-0 flex-1 bg-denetim px-2 py-1 font-mono text-[11px] text-metin-govde"
                />
                <Button onClick={() => copy(collab.session!.inviteUrl, showToast)}>{t('Kopyala')}</Button>
              </div>
            </div>

            <section>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-metin-etiket">{t('Davet oluştur')}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[140px] flex-1">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
                  >
                    {ROLES.filter((r) => r !== 'owner').map((r) => (
                      <option key={r} value={r}>
                        {t(ROLE_LABELS[r])} — {t(ROLE_DESCRIPTIONS[r])}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <select
                    value={expiry}
                    onChange={(e) => setExpiry(Number(e.target.value))}
                    className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
                  >
                    <option value={60}>1 saat</option>
                    <option value={480}>8 saat</option>
                    <option value={1440}>{t('1 gün')}</option>
                    <option value={10080}>1 hafta</option>
                  </select>
                </div>
                <div className="w-36">
                  <select
                    aria-label={t('Bağlantıyı kaç kişi kullanabilir')}
                    title={t('Davet bağlantısı adres satırında taşınıyor ve tarayıcı geçmişine düşüyor. Sınır, bağlantı sızsa bile yabancının girmesini engelliyor.')}
                    value={kullanimSiniri}
                    onChange={(e) => setKullanimSiniri(Number(e.target.value))}
                    className="w-full bg-denetim px-2 py-1.5 text-xs outline-none"
                  >
                    <option value={1}>{t('tek kişilik')}</option>
                    <option value={3}>{t('3 kişi')}</option>
                    <option value={10}>{t('10 kişi')}</option>
                    <option value={50}>{t('50 kişi')}</option>
                  </select>
                </div>
                <Button variant="primary" onClick={createInvite} disabled={busy}>
                  {t('Davet linki üret')}
                </Button>
              </div>

              {invites.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {invites.map((inv) => (
                    <li
                      key={inv.tokenId}
                      className={
                        'flex items-center gap-2 border border-kenar-denetim bg-etkin/60 px-2 py-1.5 text-[11px] ' +
                        (inv.revoked ? 'opacity-40' : '')
                      }
                    >
                      <span className="bg-denetim px-1.5 py-0.5 text-[10px] text-amber">
                        {t(ROLE_LABELS[inv.role as Role])}
                      </span>
                      <input
                        readOnly
                        value={inv.inviteUrl}
                        className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-metin-zayif"
                      />
                      <span className="text-[10px] text-metin-etiket">
                        {new Date(inv.expiresAt).toLocaleString('tr-TR')}
                      </span>
                      <Button onClick={() => copy(inv.inviteUrl, showToast)}>{t('Kopyala')}</Button>
                      {geriDonguMu(inv.inviteUrl) && (
                        <span
                          data-testid="davet-yerel-uyari"
                          title={t('Bu adres YALNIZ bu bilgisayarda çalışır. Davetli başka bir makinedeyse linki açtığında kendi bilgisayarına gider ve "bağlanamadı" der. Sunucuyu ağdan erişilebilir bir adresle başlat ya da STORYBOARD_WEB_URL ile genel adresi ver.')}
                          className="shrink-0 inline-flex items-center gap-1 text-[10px] text-uyari"
                        >
                          <Ikon ad="uyari" boyut={11} /> {t('yalnız bu bilgisayar')}
                        </span>
                      )}
                      {!inv.revoked && (
                        <Button
                          variant="danger"
                          onClick={async () => {
                            if (!collab.session || !ownerToken) return;
                            await sessionApi.revokeInvite(
                              serverUrl,
                              collab.session.roomId,
                              ownerToken,
                              inv.tokenId,
                            );
                            void refreshInvites();
                          }}
                        >
                          {t('İptal')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-metin-etiket">
                {t('Aktif kullanıcılar')} ({collab.participants.length})
              </p>
              <ul className="space-y-1">
                {collab.participants.map((p) => (
                  <li
                    key={p.clientId}
                    className="flex items-center gap-2 border border-kenar-denetim bg-etkin/60 px-2 py-1.5 text-xs"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.activePanelId && (
                      <span className="text-[10px] text-metin-etiket">{t('panel düzenliyor')}</span>
                    )}
                    <select
                      value={p.role}
                      onChange={(e) => changeRole(p.userId, e.target.value as Role)}
                      className="bg-panel px-1 py-0.5 text-[10px] outline-none"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(ROLE_LABELS[r])}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
                {!collab.participants.length && (
                  <li className="px-2 py-1.5 text-xs text-metin-etiket">{t('Henüz kimse katılmadı.')}</li>
                )}
              </ul>
            </section>
          </>
        )}

        <div className="bg-etkin/50 p-3 text-[11px] text-metin-zayif">
          <p className="mzn-etiket mb-1.5">{t('Roller')}</p>
          <ul className="space-y-0.5">
            {ROLES.map((r) => (
              <li key={r}>
                <strong className="text-metin-guclu">{t(ROLE_LABELS[r])}</strong> — {t(ROLE_DESCRIPTIONS[r])}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-metin-etiket">
            {t('Rol denetimi sunucu tarafında zorunlu kılınır; arayüzü değiştirmek yetki kazandırmaz.')}
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-metin-etiket">{label}</p>
      {children}
    </div>
  );
}

function copy(text: string, toast: (m: string, k?: 'info' | 'error' | 'success') => void) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast(t('Panoya kopyalandı.'), 'success'))
    .catch(() => toast(t('Kopyalanamadı.'), 'error'));
}
