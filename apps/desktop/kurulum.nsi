; ============================================================================
;  Auteur — installer
;
;  WHY HAND-WRITTEN: electron-builder's NSIS target fails on this machine.
;  makensis itself is fine (v3.04, verified) but the builder tries to RUN
;  the unsigned intermediate uninstaller it just produced, and Windows
;  Smart App Control blocks that (`spawn UNKNOWN`). This script never does
;  that step.
;
;  Bonus: the wizard carries the product's own identity — dark ground,
;  amber accent, the same mark (user request, 2026-08-27).
;
;  ENCODING: this file MUST be saved as UTF-8 WITH BOM. Without the BOM
;  makensis reads it as ANSI and every non-ASCII character turns to
;  mojibake — that is exactly what happened on the first build.
;
;  English UI (user decision): the installer speaks English; the app
;  itself still offers Turkish from Settings.
;
;  Installs per-user (HKCU + %LOCALAPPDATA%): NO administrator rights.
;  Asking for elevation to write screenplays would be asking for more
;  power than the job needs.
; ============================================================================

Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define PRODUCT   "Auteur"
!define VERSION   "0.1.0"
!define PUBLISHER "Auteur"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Auteur"
!define FILECLASS "Auteur.Proje"

Name "${PRODUCT} ${VERSION}"
OutFile "release\Auteur-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Auteur"
InstallDirRegKey HKCU "Software\${PRODUCT}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

; ------------------------------ appearance ---------------------------------
; The product is a dark application; a bright white wizard would look like
; a different program. MUI only lets us set page background and text, so
; those carry the identity together with the mark on the side banner.
!define MUI_BGCOLOR "0F1114"
!define MUI_TEXTCOLOR "DDE1E6"
!define MUI_ICON   "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP   "build\kurulum-yan.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "build\kurulum-yan.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "build\kurulum-ust.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADER_TRANSPARENT_TEXT
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Install ${PRODUCT}"
!define MUI_WELCOMEPAGE_TEXT "Screenwriting and storyboarding in one program.$\r$\n$\r$\nThis wizard will install ${PRODUCT} ${VERSION} on your computer.$\r$\n$\r$\nNo administrator rights are required — the program is installed for the current user only.$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_RUN "$INSTDIR\Auteur.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${PRODUCT} now"
!define MUI_FINISHPAGE_TEXT "${PRODUCT} has been installed.$\r$\n$\r$\nShortcuts are on your Desktop and in the Start menu. Your .sbp project files now carry the ${PRODUCT} icon and open with this program when double-clicked."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!define MUI_UNCONFIRMPAGE_TEXT_TOP "${PRODUCT} will be removed from the folder below.$\r$\n$\r$\nYOUR WORK IS NOT DELETED: your .sbp files, version history and automatic backups stay where they are."
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ------------------------------- install -----------------------------------
Section "Auteur" MainSection
  SectionIn RO
  SetOutPath "$INSTDIR"
  ; The whole unpacked app: Electron runtime, asar bundle and ffmpeg.
  ; Nothing is expected to already exist on the target machine.
  File /r "release\win-unpacked\*.*"

  ; --- shortcuts ---
  CreateShortcut "$DESKTOP\${PRODUCT}.lnk" "$INSTDIR\Auteur.exe" "" "$INSTDIR\Auteur.exe" 0
  CreateDirectory "$SMPROGRAMS\${PRODUCT}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT}\${PRODUCT}.lnk" "$INSTDIR\Auteur.exe" "" "$INSTDIR\Auteur.exe" 0
  CreateShortcut "$SMPROGRAMS\${PRODUCT}\Uninstall ${PRODUCT}.lnk" "$INSTDIR\Uninstall.exe"

  ; --- .sbp file association ---
  ; The icon comes from a separate file, not from inside the exe: the
  ; document mark is a different drawing from the application mark and the
  ; user should not confuse the two.
  WriteRegStr HKCU "Software\Classes\.sbp" "" "${FILECLASS}"
  WriteRegStr HKCU "Software\Classes\${FILECLASS}" "" "Auteur Project"
  WriteRegStr HKCU "Software\Classes\${FILECLASS}\DefaultIcon" "" "$INSTDIR\resources\dosya.ico"
  WriteRegStr HKCU "Software\Classes\${FILECLASS}\shell\open\command" "" '"$INSTDIR\Auteur.exe" "%1"'

  ; --- Programs and Features entry ---
  WriteRegStr HKCU "Software\${PRODUCT}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName"     "${PRODUCT}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon"     "$INSTDIR\Auteur.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ; Refresh the shell icon cache; without this .sbp files keep showing the
  ; OLD icon even though the association was written.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
SectionEnd

; ------------------------------ uninstall ----------------------------------
Section "Uninstall"
  Delete "$DESKTOP\${PRODUCT}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT}\${PRODUCT}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT}\Uninstall ${PRODUCT}.lnk"
  RMDir  "$SMPROGRAMS\${PRODUCT}"

  DeleteRegKey HKCU "Software\Classes\.sbp"
  DeleteRegKey HKCU "Software\Classes\${FILECLASS}"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\${PRODUCT}"

  ; Program files go; USER DATA (%APPDATA%\Auteur — autosaves, version
  ; history, the §15 journals) stays untouched. Uninstalling must never
  ; delete the user's work; a reinstall finds everything in place.
  RMDir /r "$INSTDIR"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
SectionEnd
