import type { ThemeId } from '../../shared/types.ts';

export type Language = 'en' | 'de';

type InkId = 'ink' | 'navy' | 'red' | 'green' | 'gold' | 'violet';
type BrushId = 'fine' | 'medium' | 'bold';

interface Messages {
  metaDescription: string;
  common: {
    brandHomeLabel: string;
    loading: string;
    goHome: string;
    edit: string;
    done: string;
    saved: string;
  };
  home: {
    heroLine1: string;
    heroLine2: string;
    intro: string;
    recipientLabel: string;
    recipientPlaceholder: string;
    chooseCover: string;
    createCard: string;
    creating: string;
    createError: string;
    noAccount: string;
    yourCards: string;
    cardFor: (recipient: string) => string;
    untitledCard: string;
    open: string;
    madeFor: string;
    viewCode: string;
  };
  themes: Record<ThemeId, { name: string; blurb: string }>;
  inks: Record<InkId, string>;
  brushes: Record<BrushId, string>;
  editor: {
    documentTitle: string;
    otherDeviceTitle: string;
    otherDeviceBody: string;
    openCard: string;
    makeOwn: string;
    cardMissing: string;
    loadFailed: string;
    cardFor: (recipient: string) => string;
    yourCard: string;
    preview: string;
    writeHint: string;
    writeHintDetail: string;
    writingSurface: string;
    removePhoto: string;
    arrangeInstruction: string;
    rotateHint: string;
    inkColour: string;
    penSize: string;
    photos: string;
    eraser: string;
    undo: string;
    clearCard: string;
    addPhoto: string;
    arrangePhotos: string;
    readyEyebrow: string;
    readyTitle: string;
    readyBody: string;
    qrLabel: string;
    copy: string;
    copied: string;
    copyPrompt: string;
    qrInstruction: string;
    share: string;
    keepWriting: string;
    maxPhotos: (count: number) => string;
    addingPhoto: string;
    addPhotoError: string;
    saving: string;
    removePhotoError: string;
    unsaved: string;
    editForbidden: string;
    saveRetry: string;
    clearConfirm: string;
    shareTitle: (recipient: string) => string;
    shareTitleGeneric: string;
  };
  viewer: {
    documentTitle: (recipient: string) => string;
    documentTitleGeneric: string;
    cardMissing: string;
    loadFailed: string;
    badLink: string;
    retry: string;
    makeCard: string;
    tapToOpen: string;
    tapToSkip: string;
    watchAgain: string;
    makeOwn: string;
    emptyOwnerBeforeLink: string;
    emptyOwnerLink: string;
    emptyFor: (recipient: string) => string;
    emptyGeneric: string;
  };
  router: {
    lost: string;
  };
  debug: {
    copyLog: string;
    clear: string;
    events: string;
    copyPrompt: string;
  };
}

const english: Messages = {
  metaDescription: 'Handwrite a birthday card on your iPad, share it as a link, and let them watch every stroke unfold.',
  common: {
    brandHomeLabel: 'birthday.card home',
    loading: 'Loading…',
    goHome: 'Go home',
    edit: 'Edit',
    done: 'Done',
    saved: 'Saved',
  },
  home: {
    heroLine1: 'Handwrite a card.',
    heroLine2: 'Share a link.',
    intro:
      'Pick up your Apple Pencil and write a birthday message the way you would on paper. When they open the link, the card unfolds and your handwriting appears, stroke by stroke.',
    recipientLabel: 'Who is it for?',
    recipientPlaceholder: 'Their name (optional)',
    chooseCover: 'Choose a cover',
    createCard: 'Create card',
    creating: 'Creating…',
    createError: 'Something went wrong. Please try again.',
    noAccount: 'No account needed. Only this device can edit the card; anyone with the link can open it.',
    yourCards: 'Your cards',
    cardFor: (recipient) => `For ${recipient}`,
    untitledCard: 'Untitled card',
    open: 'Open',
    madeFor: 'Made for iPad and Apple Pencil, works anywhere with a browser.',
    viewCode: 'View the code on GitHub',
  },
  themes: {
    confetti: { name: 'Confetti', blurb: 'Warm cream, scattered colour' },
    midnight: { name: 'Midnight', blurb: 'Deep blue with gold stars' },
    blush: { name: 'Blush', blurb: 'Soft pink and balloons' },
    botanical: { name: 'Botanical', blurb: 'Sage green and leaves' },
    circle: { name: 'Circle', blurb: 'White, one bright colour' },
    classic: { name: 'Classic', blurb: 'Cobalt lettering and painted folk florals' },
  },
  inks: {
    ink: 'Ink',
    navy: 'Navy',
    red: 'Cherry',
    green: 'Forest',
    gold: 'Gold',
    violet: 'Violet',
  },
  brushes: {
    fine: 'Fine',
    medium: 'Medium',
    bold: 'Bold',
  },
  editor: {
    documentTitle: 'Write your card · birthday.card',
    otherDeviceTitle: 'This card lives on another device',
    otherDeviceBody: 'Cards can only be edited where they were created. You can still open it.',
    openCard: 'Open the card',
    makeOwn: 'Make your own',
    cardMissing: "This card doesn't exist",
    loadFailed: "Couldn't load the card",
    cardFor: (recipient) => `Card for ${recipient}`,
    yourCard: 'Your card',
    preview: 'Preview',
    writeHint: 'Write your message here.',
    writeHintDetail: 'Left page, right page — it’s all yours. Pinch to zoom.',
    writingSurface: 'Card writing surface',
    removePhoto: 'Remove photo',
    arrangeInstruction: 'Drag a photo to move it, pull the corner to resize.',
    rotateHint: 'Turn your device sideways for a bigger card.',
    inkColour: 'Ink colour',
    penSize: 'Pen size',
    photos: 'Photos',
    eraser: 'Eraser',
    undo: 'Undo',
    clearCard: 'Clear the card',
    addPhoto: 'Add a photo',
    arrangePhotos: 'Arrange photos',
    readyEyebrow: 'Ready to send',
    readyTitle: 'Your card is ready',
    readyBody: 'Anyone with this link can open it and watch your handwriting appear. Only this device can change it.',
    qrLabel: 'QR code for the card link',
    copy: 'Copy',
    copied: 'Copied',
    copyPrompt: 'Copy this link',
    qrInstruction: 'Point a phone camera at the code to open the card.',
    share: 'Share…',
    keepWriting: 'Keep writing',
    maxPhotos: (count) => `At most ${count} photos`,
    addingPhoto: 'Adding photo…',
    addPhotoError: 'Could not add photo',
    saving: 'Saving…',
    removePhotoError: 'Couldn’t remove photo',
    unsaved: 'Unsaved',
    editForbidden: 'Not allowed to edit',
    saveRetry: 'Couldn’t save — retrying',
    clearConfirm: 'Clear everything you wrote on this card? Photos stay — and you can undo this.',
    shareTitle: (recipient) => `A birthday card for ${recipient}`,
    shareTitleGeneric: 'A birthday card',
  },
  viewer: {
    documentTitle: (recipient) => `A birthday card for ${recipient}`,
    documentTitleGeneric: 'A birthday card',
    cardMissing: 'This card doesn’t exist',
    loadFailed: 'Couldn’t load the card',
    badLink: 'Check the link you were sent — or make a card of your own.',
    retry: 'Please try again in a moment.',
    makeCard: 'Make a card',
    tapToOpen: 'Tap to open',
    tapToSkip: 'Tap to skip',
    watchAgain: 'Watch again',
    makeOwn: 'Make your own card',
    emptyOwnerBeforeLink: 'Nothing written yet — ',
    emptyOwnerLink: 'write your message',
    emptyFor: (recipient) => `${recipient}, this card is still blank.`,
    emptyGeneric: 'This card is still blank.',
  },
  router: {
    lost: 'Lost?',
  },
  debug: {
    copyLog: 'Copy log',
    clear: 'Clear',
    events: 'events',
    copyPrompt: 'Copy the log',
  },
};

const german: Messages = {
  metaDescription:
    'Schreibe eine Geburtstagskarte auf deinem iPad von Hand, teile sie als Link und lass jeden Strich lebendig werden.',
  common: {
    brandHomeLabel: 'birthday.card – Startseite',
    loading: 'Wird geladen…',
    goHome: 'Zur Startseite',
    edit: 'Bearbeiten',
    done: 'Fertig',
    saved: 'Gespeichert',
  },
  home: {
    heroLine1: 'Schreib eine Karte.',
    heroLine2: 'Teile einen Link.',
    intro:
      'Nimm deinen Apple Pencil zur Hand und schreibe eine Geburtstagsnachricht wie auf Papier. Wenn die Karte über den Link geöffnet wird, entfaltet sie sich und deine Handschrift erscheint Strich für Strich.',
    recipientLabel: 'Für wen ist die Karte?',
    recipientPlaceholder: 'Name (optional)',
    chooseCover: 'Kartendesign auswählen',
    createCard: 'Karte erstellen',
    creating: 'Wird erstellt…',
    createError: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
    noAccount: 'Kein Konto nötig. Nur auf diesem Gerät kann die Karte bearbeitet werden; alle mit dem Link können sie öffnen.',
    yourCards: 'Deine Karten',
    cardFor: (recipient) => `Für ${recipient}`,
    untitledCard: 'Karte ohne Titel',
    open: 'Öffnen',
    madeFor: 'Für iPad und Apple Pencil gemacht – funktioniert überall mit einem Browser.',
    viewCode: 'Code auf GitHub ansehen',
  },
  themes: {
    confetti: { name: 'Konfetti', blurb: 'Warmes Cremeweiß mit buntem Konfetti' },
    midnight: { name: 'Mitternacht', blurb: 'Tiefblau mit goldenen Sternen' },
    blush: { name: 'Rosé', blurb: 'Zartrosa mit Luftballons' },
    botanical: { name: 'Botanisch', blurb: 'Salbeigrün mit Blättern' },
    circle: { name: 'Kreis', blurb: 'Weiß mit einem leuchtenden Farbakzent' },
    classic: { name: 'Klassisch', blurb: 'Kobaltblaue Schrift mit gemalten Blüten' },
  },
  inks: {
    ink: 'Schwarz',
    navy: 'Marineblau',
    red: 'Kirschrot',
    green: 'Waldgrün',
    gold: 'Gold',
    violet: 'Violett',
  },
  brushes: {
    fine: 'Fein',
    medium: 'Mittel',
    bold: 'Breit',
  },
  editor: {
    documentTitle: 'Karte schreiben · birthday.card',
    otherDeviceTitle: 'Diese Karte wurde auf einem anderen Gerät erstellt',
    otherDeviceBody: 'Karten können nur dort bearbeitet werden, wo sie erstellt wurden. Du kannst sie trotzdem öffnen.',
    openCard: 'Karte öffnen',
    makeOwn: 'Eigene Karte erstellen',
    cardMissing: 'Diese Karte existiert nicht',
    loadFailed: 'Die Karte konnte nicht geladen werden',
    cardFor: (recipient) => `Karte für ${recipient}`,
    yourCard: 'Deine Karte',
    preview: 'Vorschau',
    writeHint: 'Schreibe deine Nachricht hier.',
    writeHintDetail: 'Linke Seite, rechte Seite – beide gehören dir. Mit zwei Fingern zoomen.',
    writingSurface: 'Schreibfläche der Karte',
    removePhoto: 'Foto entfernen',
    arrangeInstruction: 'Ziehe ein Foto, um es zu verschieben, und die Ecke, um seine Größe zu ändern.',
    rotateHint: 'Drehe dein Gerät quer, um die Karte größer zu sehen.',
    inkColour: 'Tintenfarbe',
    penSize: 'Stiftstärke',
    photos: 'Fotos',
    eraser: 'Radiergummi',
    undo: 'Rückgängig',
    clearCard: 'Karte leeren',
    addPhoto: 'Foto hinzufügen',
    arrangePhotos: 'Fotos anordnen',
    readyEyebrow: 'Bereit zum Senden',
    readyTitle: 'Deine Karte ist fertig',
    readyBody: 'Alle mit diesem Link können sie öffnen und sehen, wie deine Handschrift erscheint. Nur auf diesem Gerät kann sie geändert werden.',
    qrLabel: 'QR-Code für den Kartenlink',
    copy: 'Kopieren',
    copied: 'Kopiert',
    copyPrompt: 'Diesen Link kopieren',
    qrInstruction: 'Richte eine Handykamera auf den Code, um die Karte zu öffnen.',
    share: 'Teilen…',
    keepWriting: 'Weiterschreiben',
    maxPhotos: (count) => `Höchstens ${count} Fotos`,
    addingPhoto: 'Foto wird hinzugefügt…',
    addPhotoError: 'Foto konnte nicht hinzugefügt werden',
    saving: 'Wird gespeichert…',
    removePhotoError: 'Foto konnte nicht entfernt werden',
    unsaved: 'Nicht gespeichert',
    editForbidden: 'Bearbeiten nicht erlaubt',
    saveRetry: 'Speichern fehlgeschlagen – neuer Versuch',
    clearConfirm: 'Alles Geschriebene auf dieser Karte löschen? Fotos bleiben erhalten – und du kannst dies rückgängig machen.',
    shareTitle: (recipient) => `Eine Geburtstagskarte für ${recipient}`,
    shareTitleGeneric: 'Eine Geburtstagskarte',
  },
  viewer: {
    documentTitle: (recipient) => `Eine Geburtstagskarte für ${recipient}`,
    documentTitleGeneric: 'Eine Geburtstagskarte',
    cardMissing: 'Diese Karte existiert nicht',
    loadFailed: 'Die Karte konnte nicht geladen werden',
    badLink: 'Prüfe den Link, den du erhalten hast – oder erstelle eine eigene Karte.',
    retry: 'Bitte versuche es gleich noch einmal.',
    makeCard: 'Karte erstellen',
    tapToOpen: 'Zum Öffnen tippen',
    tapToSkip: 'Zum Überspringen tippen',
    watchAgain: 'Noch einmal ansehen',
    makeOwn: 'Eigene Karte erstellen',
    emptyOwnerBeforeLink: 'Noch nichts geschrieben – ',
    emptyOwnerLink: 'schreib deine Nachricht',
    emptyFor: (recipient) => `${recipient}, diese Karte ist noch leer.`,
    emptyGeneric: 'Diese Karte ist noch leer.',
  },
  router: {
    lost: 'Verlaufen?',
  },
  debug: {
    copyLog: 'Protokoll kopieren',
    clear: 'Leeren',
    events: 'Ereignisse',
    copyPrompt: 'Protokoll kopieren',
  },
};

export function resolveLanguage(browserLanguage: string | undefined): Language {
  return /^de(?:-|$)/i.test(browserLanguage?.trim() ?? '') ? 'de' : 'en';
}

export const language = resolveLanguage(typeof navigator === 'undefined' ? undefined : navigator.language);
export const locale = language === 'de' ? 'de-DE' : 'en-GB';
export const text = language === 'de' ? german : english;

export function initializeI18n(): void {
  document.documentElement.lang = language;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', text.metaDescription);
}

export function formatDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat(locale).format(new Date(value));
}
