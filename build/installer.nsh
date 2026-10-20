; 安装器补充脚本
;
; 1. 安装完成 → 开始菜单建一个「卸载 星塔反和谐工具」入口（否则卸载只能去「设置 → 应用」里找）
; 2. 给快捷方式写入 AppUserModelID，与主进程里的 app.setAppUserModelId 保持一致，
;    否则 Windows 任务栏按 AUMID 找图标，找不到就显示默认白纸图标
;
; 只碰两个路径：$INSTDIR 与 $APPDATA\ssuncensor，不会向上越级。
; /SD IDNO：静默卸载（/S）不删缓存。

!macro customInstall
  CreateShortCut "$SMPROGRAMS\卸载 ${PRODUCT_NAME}.lnk" "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"

  IfFileExists "$SMPROGRAMS\${PRODUCT_NAME}.lnk" 0 +2
    WinShell::SetLnkAUMI "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "com.makostar.ssuncensor"
  IfFileExists "$DESKTOP\${PRODUCT_NAME}.lnk" 0 +2
    WinShell::SetLnkAUMI "$DESKTOP\${PRODUCT_NAME}.lnk" "com.makostar.ssuncensor"
  IfFileExists "$SMPROGRAMS\卸载 ${PRODUCT_NAME}.lnk" 0 +2
    WinShell::SetLnkAUMI "$SMPROGRAMS\卸载 ${PRODUCT_NAME}.lnk" "com.makostar.ssuncensor"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\卸载 ${PRODUCT_NAME}.lnk"
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除应用缓存？$\r$\n$\r$\n位置：$APPDATA\ssuncensor（Electron 缓存）$\r$\n$\r$\n配置、启动日志、ResourceTool 与 output 资源都在安装目录里，会随程序一起删除。" \
    /SD IDNO IDNO skipDataWipe
  RMDir /r "$APPDATA\ssuncensor"
  skipDataWipe:
!macroend
