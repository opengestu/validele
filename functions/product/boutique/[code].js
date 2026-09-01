// /product/boutique/{code} : URL mutilée (autocomplétion navigateur qui préfixe
// /product/, copier-coller partiel...). Même traitement que /boutique/{code}.
export { onRequestGet } from '../../boutique/[code].js';
