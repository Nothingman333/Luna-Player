import {lazy,Suspense} from "react";
import type {ComponentType,ComponentProps} from "react";
function deferred<P extends object>(load:()=>Promise<{default:ComponentType<P>}>){const View=lazy(load);return function DeferredView(props:P){return <Suspense fallback={null}><View {...props}/></Suspense>;};}
export const MusicPage=deferred<ComponentProps<typeof import("./MusicUI").MusicPage>>(()=>import("./MusicUI").then(m=>({default:m.MusicPage})));
export const BooksPage=deferred<ComponentProps<typeof import("./BooksUI").BooksPage>>(()=>import("./BooksUI").then(m=>({default:m.BooksPage})));
export const BookLinkDialog=deferred<ComponentProps<typeof import("./BooksUI").BookLinkDialog>>(()=>import("./BooksUI").then(m=>({default:m.BookLinkDialog})));
export const MinePage=deferred<ComponentProps<typeof import("./MineUI").MinePage>>(()=>import("./MineUI").then(m=>({default:m.MinePage})));
export const TitleDetail=deferred<ComponentProps<typeof import("./TasteUI").TitleDetail>>(()=>import("./TasteUI").then(m=>({default:m.TitleDetail})));
export const RecsPage=deferred<ComponentProps<typeof import("./TasteUI").RecsPage>>(()=>import("./TasteUI").then(m=>({default:m.RecsPage})));
export const ChatPanel=deferred<ComponentProps<typeof import("./TasteUI").ChatPanel>>(()=>import("./TasteUI").then(m=>({default:m.ChatPanel})));
