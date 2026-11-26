// Prévia "Ver mais": o bloco recolhido só ganha botão se o conteúdo passa da altura visível.
// A folga de 1px absorve o arredondamento de subpixel entre scrollHeight e clientHeight.
export function needsClamp(scrollHeight, clientHeight) {
  return scrollHeight > clientHeight + 1;
}
