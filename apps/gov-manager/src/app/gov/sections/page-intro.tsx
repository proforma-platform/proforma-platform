export function PageIntro(props: { title: string; subtitle: string }) {
  return (
    <div className="gm-header-copy">
      <h1>{props.title}</h1>
      <p>{props.subtitle}</p>
    </div>
  );
}
