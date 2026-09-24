import React, { useEffect, useState } from 'react';
import { t } from '../../dil/arayuz';
import { Modal, Button } from './Modal';
import { usePlatform } from '../../platform/context';
import { useProjectStore } from '../../store/project';
import { useUiStore } from '../../store/ui';
import { unpackProject } from '../../model/project-io';
import { assetUrlsFrom } from '../../util/assets';
import type { RecentProject } from '../../platform/types';

export function RecentDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const showToast = useUiStore((s) => s.showToast);
  const [items, setItems] = useState<RecentProject[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platform.listRecentProjects().then(setItems).catch(() => setItems([]));
  }, [platform]);

  const open = async (path: string) => {
    setBusy(true);
    try {
      const data = await platform.readProjectFile(path);
      const bundle = await unpackProject(data);
      useProjectStore.getState().replaceProject(bundle.project, {
        filePath: path,
        assets: assetUrlsFrom(bundle.assets),
      });
      showToast(`Açıldı: ${bundle.project.meta.name}`, 'success');
      onClose();
    } catch (err) {
      showToast(`Açılamadı: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('Son Açılan Projeler')} onClose={onClose} footer={<Button onClick={onClose}>{t('Kapat')}</Button>}>
      {!items.length && <p className="py-6 text-center text-xs text-metin-etiket">{t('Henüz kayıt yok.')}</p>}
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.path}
            className="flex items-center gap-2 border border-kenar-denetim bg-etkin/60 px-2 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-metin">{item.name}</p>
              <p className="truncate text-[10px] text-metin-etiket">{item.path}</p>
            </div>
            <span className="text-[10px] text-metin-etiket">
              {new Date(item.openedAt).toLocaleString('tr-TR')}
            </span>
            <Button variant="primary" disabled={busy} onClick={() => open(item.path)}>
              {t('Aç')}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
