; Remove the "Start with Windows" entry the app creates, but only on a real
; uninstall: updates also run the old uninstaller and must keep it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Minecraftly"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Minecraftly"
    ; Browser extension link (native messaging host), registered by the app on start
    DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.minecraftly.host"
    DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.minecraftly.host"
    DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\com.minecraftly.host"
  ${endIf}
!macroend
