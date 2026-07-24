// /product/acheter/{code} : URL mutilée (autocomplétion navigateur qui préfixe
// /product/, copier-coller partiel...). Même traitement que /acheter/{code}.
export { onRequestGet } from '../../acheter/[code].js';
