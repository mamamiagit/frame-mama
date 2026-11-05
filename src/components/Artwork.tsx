export default function Artwork({ kind, title }: { kind: string; title: string }) {
  return <div role="img" aria-label={title} className={`artwork art-${kind}`}>
    <div className="art-grain" />
    <div className="shape shape-one" /><div className="shape shape-two" /><div className="shape shape-three" />
    {kind === 'mountains' && <span className="art-caption">TAKE THE<br /><b>LONG WAY.</b></span>}
    {kind === 'objects' && <span className="art-caption">Less,<br /><i>but better.</i></span>}
    {kind === 'desk' && <span className="art-small">A SPACE TO CREATE</span>}
    {kind === 'ocean' && <span className="art-caption">Coastal<br /><i>stillness</i></span>}
    {kind === 'music' && <span className="art-small">SUNDAY SELECTS / VOL. 04</span>}
    {kind === 'house' && <span className="art-small">SMALL SPACE. BIG POSSIBILITIES.</span>}
    {kind === 'city' && <span className="art-caption">AFTER<br /><b>HOURS</b></span>}
    {kind === 'light' && <span className="art-caption">a different<br /><i>perspective.</i></span>}
  </div>;
}
