import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  Check,
  CheckCircle,
  Calendar,
  Clipboard,
  Clock,
  Shield,
  Smartphone,
  ChevronRight,
  Coffee,
  MapPin,
} from "react-feather";
import headerLogo from "../assets/servifood-logo-header.png";
// Locally served editorial photo: images.unsplash.com/photo-1547592180-85f173990554
import mealPhoto from "../assets/landing-meal.jpg";
import "../styles/landing.css";

const steps = [
  {
    number: "01",
    icon: Calendar,
    title: "Elegí tu menú",
    text: "Entrá a tu cuenta y consultá las opciones disponibles para tu día.",
  },
  {
    number: "02",
    icon: CheckCircle,
    title: "Confirmá tu pedido",
    text: "Seleccioná tu comida y revisá los detalles antes de confirmar.",
  },
  {
    number: "03",
    icon: Clipboard,
    title: "Tené todo a mano",
    text: "Consultá tus pedidos y su estado desde un mismo lugar.",
  },
];

function AccessLinks() {
  return (
    <div className="sf-access">
      <Link className="sf-button sf-button-primary" to="/login">
        Iniciar sesión <ArrowUpRight size={19} aria-hidden="true" />
      </Link>
      <Link className="sf-button sf-button-secondary" to="/register">
        Registrarse <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </div>
  );
}

// A visual example only: it never reads or creates an actual order.
function OrderPreview() {
  return (
    <figure
      className="sf-preview"
      aria-label="Ejemplo ilustrativo del menú y de un pedido en ServiFood"
    >
      <div className="sf-preview-top">
        <span className="sf-preview-brand">
          ServiFood<span> / Mi cuenta</span>
        </span>
        <span className="sf-avatar">SF</span>
      </div>
      <div className="sf-preview-content">
        <div className="sf-preview-heading">
          <div>
            <span className="sf-mini-label">¿QUÉ COMEMOS HOY?</span>
            <h3>Tu menú del día</h3>
          </div>
          <span className="sf-today">
            <Calendar size={12} /> Hoy
          </span>
        </div>
        <div className="sf-preview-option sf-preview-selected">
          <span className="sf-radio">
            <Check size={12} strokeWidth={3} />
          </span>
          <div>
            <strong>Pollo al verdeo con papas</strong>
            <span>Menú principal</span>
          </div>
          <span className="sf-option-number">01</span>
        </div>
        <div className="sf-preview-option">
          <span className="sf-radio" />
          <div>
            <strong>Tarta de verdura</strong>
            <span>Opción vegetariana</span>
          </div>
          <span className="sf-option-number">02</span>
        </div>
        <div className="sf-order-details">
          <span>
            <Coffee size={14} /> Almuerzo
          </span>
          <span>
            <MapPin size={14} /> Tu lugar de entrega
          </span>
        </div>
        <div className="sf-confirmed">
          <CheckCircle size={17} />
          <span>Pedido confirmado</span>
          <Check size={16} />
        </div>
        <div className="sf-delivery">
          <span>Estado de entrega</span>
          <strong>
            <i /> Pendiente
          </strong>
        </div>
      </div>
      <figcaption>
        Vista ilustrativa · Las opciones dependen de tu menú.
      </figcaption>
    </figure>
  );
}

export default function LandingPage() {
  return (
    <div className="sf-landing">
      <a href="#contenido" className="sf-skip">
        Ir al contenido
      </a>
      <div className="sf-blue-stage">
        <header className="sf-header sf-container">
          <Link to="/" className="sf-logo-link" aria-label="ServiFood, inicio">
            <img
              src={headerLogo}
              alt="ServiFood Catering"
              width="72"
              height="99"
            />
          </Link>
          <nav className="sf-nav" aria-label="Navegación principal">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#experiencia">La experiencia</a>
          </nav>
          <Link to="/login" className="sf-header-login">
            Iniciar sesión <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </header>
        <main id="contenido">
          <section
            className="sf-hero sf-container"
            aria-labelledby="sf-hero-title"
          >
            <div className="sf-hero-copy">
              <span className="sf-eyebrow">
                <span /> BUENA COMIDA. UN DÍA MÁS SIMPLE.
              </span>
              <h1 id="sf-hero-title">
                Tus pedidos
                <br />
                diarios, <span>simples</span>
                <br />y organizados<span className="sf-period">.</span>
              </h1>
              <p>
                Tu comida es parte de tu día.
                <br />
                Elegí tu menú, confirmá tu pedido y dejá el resto organizado con
                ServiFood.
              </p>
              <AccessLinks />
              <div className="sf-hero-note">
                <Shield size={15} aria-hidden="true" />
                <span>Tu cuenta. Tus pedidos. Todo en un lugar.</span>
              </div>
            </div>
            <div className="sf-hero-visual">
              <div className="sf-orbit sf-orbit-one" />
              <div className="sf-orbit sf-orbit-two" />
              <div className="sf-food-frame">
                <img
                  src={mealPhoto}
                  alt="Plato con vegetales frescos, cereales y salmón"
                  width="1200"
                  height="800"
                  fetchPriority="high"
                />
              </div>
              <div className="sf-visual-tag">
                <span className="sf-tag-icon">
                  <Check size={17} />
                </span>
                <span>
                  Menos vueltas.<strong>Más tiempo para disfrutar.</strong>
                </span>
              </div>
              <OrderPreview />
            </div>
            <div className="sf-hero-bottom">
              <a href="#como-funciona">
                <span className="sf-scroll-icon">
                  <ArrowDown size={15} />
                </span>
                Conocé cómo funciona
              </a>
              <span>SERVICIO GASTRONÓMICO + TECNOLOGÍA</span>
            </div>
          </section>
          <section
            className="sf-process"
            id="como-funciona"
            aria-labelledby="sf-process-title"
          >
            <div className="sf-container">
              <div className="sf-section-heading">
                <div>
                  <span className="sf-eyebrow sf-eyebrow-dark">
                    ASÍ DE SIMPLE
                  </span>
                  <h2 id="sf-process-title">
                    Tu próximo pedido.
                    <br />
                    <span>Sin complicaciones.</span>
                  </h2>
                </div>
                <p>
                  Una rutina más fácil, desde la elección
                  <br className="sf-desktop-break" /> del menú hasta la consulta
                  de tu pedido.
                </p>
              </div>
              <div className="sf-steps">
                {steps.map(({ number, icon: _Icon, title, text }) => (
                  <article className="sf-step" key={number}>
                    <div className="sf-step-top">
                      <span>{number}</span>
                      <_Icon size={25} strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
          <section
            className="sf-experience"
            id="experiencia"
            aria-labelledby="sf-experience-title"
          >
            <div className="sf-container sf-experience-grid">
              <div
                className="sf-history-scene"
                aria-label="Ejemplo ilustrativo de la consulta de pedidos"
              >
                <span className="sf-scene-label">
                  <span /> TU DÍA, EN ORDEN
                </span>
                <div className="sf-history-card">
                  <div className="sf-history-heading">
                    <span className="sf-history-icon">
                      <Clipboard size={22} />
                    </span>
                    <div>
                      <h3>Mis pedidos</h3>
                      <p>Todo queda organizado.</p>
                    </div>
                  </div>
                  <div className="sf-history-row">
                    <span className="sf-date-tile">
                      <Calendar size={19} />
                    </span>
                    <div>
                      <strong>Tu almuerzo de hoy</strong>
                      <span>Pollo al verdeo con papas</span>
                    </div>
                    <span className="sf-status">Confirmado</span>
                  </div>
                  <div className="sf-history-row">
                    <span className="sf-date-tile">
                      <Check size={19} />
                    </span>
                    <div>
                      <strong>Tu pedido anterior</strong>
                      <span>Consultá el detalle de tu selección</span>
                    </div>
                    <ChevronRight size={18} />
                  </div>
                  <div className="sf-history-bottom">
                    <Shield size={14} />
                    <span>Accedé con tu cuenta personal</span>
                  </div>
                </div>
                <div className="sf-mobile-note">
                  <Smartphone size={23} />
                  <span>
                    Con vos,<strong>donde estés.</strong>
                  </span>
                </div>
                <span className="sf-scene-caption">
                  Vista ilustrativa de la experiencia ServiFood
                </span>
              </div>
              <div className="sf-experience-copy">
                <span className="sf-eyebrow sf-eyebrow-dark">
                  PENSADO PARA TU RUTINA
                </span>
                <h2 id="sf-experience-title">
                  La tranquilidad de
                  <br />
                  tenerlo <span>resuelto.</span>
                </h2>
                <p>
                  Menos tiempo gestionando tu comida. Más claridad para
                  organizar tu día.
                </p>
                <ul className="sf-benefits">
                  <li>
                    <Clock size={20} />
                    <div>
                      <h3>Simple desde el primer paso</h3>
                      <p>Elegí entre las opciones disponibles y confirmá.</p>
                    </div>
                  </li>
                  <li>
                    <Clipboard size={20} />
                    <div>
                      <h3>Tus pedidos, siempre a mano</h3>
                      <p>Revisá tus selecciones y consultá su estado.</p>
                    </div>
                  </li>
                  <li>
                    <Smartphone size={20} />
                    <div>
                      <h3>Desde donde te quede cómodo</h3>
                      <p>Accedé desde tu celular, tablet o computadora.</p>
                    </div>
                  </li>
                </ul>
                <Link to="/login" className="sf-text-link">
                  Entrar a mi cuenta <ArrowUpRight size={18} />
                </Link>
              </div>
            </div>
          </section>
          <section className="sf-final" aria-labelledby="sf-final-title">
            <div className="sf-container sf-final-inner">
              <div>
                <span className="sf-eyebrow">TU PRÓXIMA PAUSA EMPIEZA ACÁ</span>
                <h2 id="sf-final-title">
                  Buen menú.
                  <br />
                  Todo organizado<span>.</span>
                </h2>
                <p>Ingresá a ServiFood y resolvé tu próximo pedido.</p>
              </div>
              <div className="sf-final-actions">
                <AccessLinks />
                <span>¿Es tu primera vez? Creá tu cuenta para empezar.</span>
              </div>
            </div>
          </section>
        </main>
        <footer className="sf-footer sf-container">
          <Link to="/" aria-label="ServiFood, inicio">
            <img
              src={headerLogo}
              alt="ServiFood Catering"
              width="48"
              height="66"
              loading="lazy"
            />
          </Link>
          <p>La comida de cada día. Mejor organizada.</p>
          <span>
            © {new Date().getFullYear()} ServiFood.
            <br />
            Todos los derechos reservados.
          </span>
        </footer>
      </div>
    </div>
  );
}
