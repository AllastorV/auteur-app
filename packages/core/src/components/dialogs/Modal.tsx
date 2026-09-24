import React, { useEffect, useRef } from 'react';
import { t } from '../../dil/arayuz';
import { Ikon } from '../Ikon';

/**
 * Diyalog kabuğu — B · Kesme Masası.
 *
 * TÜM diyaloglar buradan geçiyor (Çeviri, Karşılaştır, Sürümler, Dışa
 * aktar, Oturum, Kısayollar, Son açılanlar, Kurtarma). Bu yüzden dil TEK
 * YERDE: her diyaloğu ayrı ayrı biçimlendirmek, yarın birinin geride
 * kalması demekti (Karar 2).
 *
 * Perde neredeyse opak (`#07080a` %78): kağıt gibi diyalog da odadaki
 * ışığın toplandığı yer olmalı, arkasındaki arayüz çekilmeli.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const kutu = useRef<HTMLDivElement>(null);

  /* Escape ve ilk odak diyaloğun KENDİ işi: her çağıranın ayrı ayrı
     bağlaması, birinin unutması demekti — klavyeyle çalışan biri o
     diyalogda kapana kısılırdı. */
  useEffect(() => {
    const el = kutu.current;
    el?.focus();
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    el?.addEventListener('keydown', tus);
    return () => el?.removeEventListener('keydown', tus);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080a]/[.78] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={kutu}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[88vh] w-full flex-col overflow-hidden border border-kenar-denetim bg-cubuk shadow-[0_28px_80px_rgba(0,0,0,.62)] outline-none"
        style={{ maxWidth: width }}
      >
        {/* Başlık VERSAL ve harf aralıklı — gezgin/denetçi bölüm
            etiketleriyle aynı dil; diyalog ayrı bir uygulama gibi
            görünmesin. */}
        <header className="flex h-[38px] shrink-0 items-center justify-between border-b border-kenar px-3.5">
          <h2 className="mzn-etiket">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="mzn-denetim flex h-6 w-6 items-center justify-center"
            aria-label={t('Kapat')}
          >
            <Ikon ad="kapat" boyut={11} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3.5 text-[13px] text-metin-govde">{children}</div>
        {footer && (
          <footer className="flex shrink-0 justify-end gap-2 border-t border-kenar bg-panel px-3.5 py-2.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
  /* Test kancası geçirilebiliyor: düğmeyi metninden bulmak, etiket
     değiştiğinde testi sessizce kırardı. */
  'data-testid': testId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  'data-testid'?: string;
}) {
  /* Birincil eylem DOLU amber, ötekiler denetim yüzeyi. Ekranda aynı anda
     yalnız BİR dolu amber olur — hangi düğmenin ana eylem olduğu tartışmaya
     açık kalmasın.

     `danger` amberden değil, durum kırmızısından geliyor: yıkıcı eylemi
     vurgu rengiyle söylemek, "önerilen" ile "geri alınamaz"ı aynı işarete
     bindirirdi. */
  const cls =
    variant === 'primary'
      ? 'mzn-birincil'
      : variant === 'danger'
        ? 'border border-[#5c2b28] bg-[#2a1817] text-[#d98078] hover:bg-[#37201e]'
        : 'mzn-denetim';
  return (
    <button
      type={type}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}
