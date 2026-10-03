; Ganchos extras do instalador (electron-builder, nsis.include no package.json).
;
; Depois de instalar ou atualizar, o Windows pode continuar mostrando o icone ANTIGO do Blink (no atalho, na barra de
; tarefas e na bandeja): ele guarda os icones em cache. Aqui o instalador avisa o Explorer de que os icones mudaram
; (SHCNE_ASSOCCHANGED) e pede que ele atualize o cache.
!macro customInstall
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  ExecWait '"$SYSDIR\ie4uinit.exe" -show'
!macroend
