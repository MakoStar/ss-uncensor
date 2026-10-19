; 安装器补充脚本
;
; 一次性卸载整个安装目录所在的盘符的文件夹（
; /SD IDNO：静默卸载（/S）不删缓存。

!macro customInstall
  CreateShortCut "$SMPROGRAMS\卸载 ${PRODUCT_NAME}.lnk" "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\卸载 ${PRODUCT_NAME}.lnk"
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除应用缓存？$\r$\n$\r$\n位置：$APPDATA\ssuncensor（Electron 缓存）$\r$\n$\r$\n配置、启动日志、ResourceTool 与 output 资源都在安装目录里，会随程序一起删除。" \
    /SD IDNO IDNO skipDataWipe
  RMDir /r "$APPDATA\ssuncensor"
  skipDataWipe:
!macroend
