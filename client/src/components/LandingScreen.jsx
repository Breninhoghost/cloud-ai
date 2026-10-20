import { useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

const prompts = [
  { label: '✨ Ter uma ideia', message: 'Adoro inventar coisas novas com você! ✨' },
  { label: '🌱 Organizar planos', message: 'Vamos transformar seus planos em passos leves? 🌱' },
  { label: '💜 Aprender algo', message: 'Aprender juntinhos é ainda mais legal! 💜' },
];

const highlights = [
  { number: '01', title: 'Uma conversa natural', text: 'Pergunte, explore ideias e refine o que está pensando.' },
  { number: '02', title: 'Do insight à prática', text: 'Organize seus próximos passos com ajuda da inteligência artificial.' },
  { number: '03', title: 'Seu espaço, seu ritmo', text: 'Retome conversas e continue de onde parou.' },
];

export default function LandingScreen({ onLogin, onRegister }) {
  const [activePrompt, setActivePrompt] = useState(-1);
  const orbSceneRef = useRef(null);
  const promptMessage = activePrompt < 0
    ? 'Oi! Que bom ter você por aqui 💜'
    : prompts[activePrompt].message;

  function moveOrb(event) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const scene = orbSceneRef.current;
    if (!scene) return;
    const bounds = scene.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    scene.style.setProperty('--orb-x', `${x * 24}px`);
    scene.style.setProperty('--orb-y', `${y * 18}px`);
    scene.style.setProperty('--orbit-x', `${x * -9}px`);
    scene.style.setProperty('--orbit-y', `${y * -7}px`);
  }

  function startOrbDrag(event) {
    if (event.pointerType !== 'touch') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveOrb(event);
  }

  function centerOrb() {
    const scene = orbSceneRef.current;
    if (!scene) return;
    scene.style.setProperty('--orb-x', '0px');
    scene.style.setProperty('--orb-y', '0px');
    scene.style.setProperty('--orbit-x', '0px');
    scene.style.setProperty('--orbit-y', '0px');
  }

  function leaveOrbScene(event) {
    if (event.pointerType === 'mouse') centerOrb();
  }

  return (
    <main className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Cloud AI — início">
          <Logo size={34} />
          <span>Cloud <strong>AI</strong></span>
        </a>
        <nav className="landing-nav-actions" aria-label="Acesso à conta">
          <button type="button" className="landing-login" onClick={onLogin}>
            Entrar
          </button>
          <button type="button" className="landing-register" onClick={onRegister}>
            Criar conta <Icon name="send" size={15} />
          </button>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-eyebrow">
            <span className="status-dot" />
            <span>INTELIGÊNCIA PARA O SEU DIA A DIA</span>
          </div>
          <h1>
            Ideias melhores
            <br />
            começam com
            <br />
            <span>uma conversa.</span>
          </h1>
          <p className="landing-description">
            Um espaço para fazer perguntas, descobrir caminhos e transformar pensamentos em possibilidades.
          </p>
          <div className="landing-prompts">
            <span>O que vamos imaginar hoje?</span>
            <div className="landing-prompt-options">
              {prompts.map((prompt, index) => (
                <button
                  type="button"
                  className={`landing-prompt${activePrompt === index ? ' active' : ''}`}
                  key={prompt.label}
                  aria-pressed={activePrompt === index}
                  aria-controls="orb-message"
                  onClick={() => setActivePrompt(index)}
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="landing-cta">
            <button type="button" className="landing-primary" onClick={onRegister}>
              Começar agora <Icon name="send" size={16} />
            </button>
            <button type="button" className="landing-secondary" onClick={onLogin}>
              Já tenho uma conta
            </button>
          </div>
          <p className="landing-footnote">
            <Icon name="check" size={15} /> Suas conversas ficam salvas na sua conta
          </p>
        </div>

        <div
          className="orb-scene"
          ref={orbSceneRef}
          role="group"
          aria-label="Companheira animada do Cloud AI"
          onPointerMove={moveOrb}
          onPointerLeave={leaveOrbScene}
          onPointerCancel={centerOrb}
        >
          <div className="orb-aura" />
          <div className="orb-orbit orbit-one"><span /></div>
          <div className="orb-orbit orbit-two"><span /></div>
          <div className="orb-orbit orbit-three"><span /></div>
          <button
            type="button"
            className="orb"
            aria-label="Ouvir outra mensagem da esfera"
            aria-controls="orb-message"
            onPointerDown={startOrbDrag}
            onClick={() => setActivePrompt((current) => (current + 1) % prompts.length)}
          >
            <span className="orb-sheen" />
            <span className="orb-contour contour-one" />
            <span className="orb-contour contour-two" />
            <span className="orb-contour contour-three" />
            <span className="orb-glint" />
            <span className="orb-face" aria-hidden="true">
              <span className="orb-eye" />
              <span className="orb-eye" />
              <span className="orb-cheek orb-cheek-left" />
              <span className="orb-cheek orb-cheek-right" />
              <span className="orb-smile" />
            </span>
          </button>
          <span className="orb-touch-hint" aria-hidden="true">Arraste a esfera com o dedo ✨</span>
          <div className="orb-label">
            <span className="orb-label-mark"><Logo size={22} /></span>
            <span><strong>Cloud AI</strong><small id="orb-message" aria-live="polite">{promptMessage}</small></span>
            <span className="orb-live" />
          </div>
          <span className="orb-coordinate coordinate-one">01 · IDEIAS</span>
          <span className="orb-coordinate coordinate-two">SEU PRÓXIMO PASSO</span>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-intro">
          <span>MAIS DO QUE RESPOSTAS</span>
          <p>Uma companhia para pensar em voz alta.</p>
        </div>
        <div className="landing-highlights">
          {highlights.map((item) => (
            <article className="landing-highlight" key={item.number}>
              <span>{item.number}</span>
              <div><strong>{item.title}</strong><p>{item.text}</p></div>
            </article>
          ))}
        </div>
      </footer>
    </main>
  );
}
