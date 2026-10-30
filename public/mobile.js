// VERSIONE MOBILE - solo JavaScript che serve agli smartphone.
// Va caricato nel <head>, prima delle librerie, e agisce solo sotto i 768px:
// sui computer non fa nulla (vedi AGENTS.md).
(function () {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    // Scorrimento fluido: SortableJS (riordino delle schede) registra su tutta la
    // pagina un "touchmove" bloccante, così a ogni movimento del dito il telefono
    // aspetta il JavaScript prima di scorrere e lo scorrimento va a scatti.
    // Qui gli ascoltatori del dito su document/window diventano "passive".
    // Il trascinamento resta possibile: la maniglia ha touch-action: none,
    // quindi mentre si trascina una scheda la pagina non scorre comunque.
    var original = EventTarget.prototype.addEventListener;
    var touchTypes = { touchstart: true, touchmove: true, wheel: true, mousewheel: true };
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (touchTypes[type] && (this === document || this === window || this === document.documentElement || this === document.body)) {
            if (options && typeof options === 'object') {
                options = Object.assign({}, options, { passive: true });
            } else {
                options = { capture: !!options, passive: true };
            }
        }
        return original.call(this, type, listener, options);
    };
})();
