type PagePlaceholderProps = {
  heading: string;
  description: string;
};

export function PagePlaceholder({ heading, description }: PagePlaceholderProps) {
  return (
    <main>
      <h1>{heading}</h1>
      <p>{description}</p>
    </main>
  );
}
