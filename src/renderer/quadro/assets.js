// Onde o Excalidraw busca os chunks, as fontes (Virgil, Cascadia...) e os idiomas: a pasta "dist" do pacote, no disco.
// (Ele acrescenta "excalidraw-assets/" a este endereco.) Fica em arquivo proprio porque a CSP nao deixa script inline.
window.EXCALIDRAW_ASSET_PATH = new URL('../../../node_modules/@excalidraw/excalidraw/dist/', document.baseURI).href;
