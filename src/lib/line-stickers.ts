// LINE free sticker pack 11537 — "MOON & SUNNY" (40 ตัว, ใช้กับ Messaging API ได้)
// ref: https://developers.line.biz/en/docs/messaging-api/sticker-list/
export const STICKER_PACK_ID = "11537";
export const STICKER_IDS: string[] = [
  "52002734","52002735","52002736","52002737","52002738",
  "52002739","52002740","52002741","52002742","52002743",
  "52002744","52002745","52002746","52002747","52002748",
  "52002749","52002750","52002751","52002752","52002753",
  "52002754","52002755","52002756","52002757","52002758",
  "52002759","52002760","52002761","52002762","52002763",
  "52002764","52002765","52002766","52002767","52002768",
  "52002769","52002770","52002771","52002772","52002773",
];

export const stickerPreviewUrl = (stickerId: string) =>
  `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
