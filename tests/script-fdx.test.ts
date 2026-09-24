// @vitest-environment jsdom
//
// `parseFdx` DOMParser'a ihtiyaç duyar; bu yüzden Node'da koşan
// `script.test.ts`'ten ayrı, jsdom ortamlı kendi dosyasında durur.
import { describe, expect, it } from 'vitest';
import { parseFdx } from '@storyboard/core/model/script';

/** İki sahne başlıklı küçük bir Final Draft gövdesi. Aksiyon satırı bilerek tekrarlı. */
const FDX = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Version="1">
  <Content>
    <Paragraph Type="Scene Heading"><Text>İÇ. MUTFAK - GÜN</Text></Paragraph>
    <Paragraph Type="Action"><Text>Kahve demleniyor.</Text></Paragraph>
    <Paragraph Type="Scene Heading"><Text>DIŞ. BAHÇE - GECE</Text></Paragraph>
    <Paragraph Type="Action"><Text>Kahve demleniyor.</Text></Paragraph>
  </Content>
</FinalDraft>`;

describe('Final Draft (.fdx) ayrıştırma', () => {
  it('her bloğa kalıcı kimlik ve sahne kimliği verir', () => {
    const blocks = parseFdx(FDX);
    expect(blocks.map((b) => b.type)).toEqual(['scene', 'action', 'scene', 'action']);

    for (const b of blocks) {
      expect(b.id).toMatch(/^sb_/);
      expect(b.sceneId).toMatch(/^sc_/);
    }

    // Aynı sahnedekiler sahne kimliğini paylaşır.
    expect(blocks[1].sceneId).toBe(blocks[0].sceneId);
    expect(blocks[3].sceneId).toBe(blocks[2].sceneId);
    // Farklı sahnedekiler paylaşmaz.
    expect(blocks[2].sceneId).not.toBe(blocks[0].sceneId);

    // Aynı metin iki kez geçse de kimlik ve parmak izi benzersiz kalır.
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
    expect(blocks[3].fp).not.toBe(blocks[1].fp);
  });
});
