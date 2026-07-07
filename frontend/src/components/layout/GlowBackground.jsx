import React from 'react';

const GlowBackground = ({ variant = 'default' }) => {
  if (variant === 'landing') {
    return (
      <>
        <div className="glow-spot bg-primary-600 top-[-10%] left-[-15%]" aria-hidden="true" />
        <div className="glow-spot bg-indigo-700 top-[25%] right-[-10%]" aria-hidden="true" />
        <div className="glow-spot bg-purple-600 bottom-[-5%] left-[20%]" aria-hidden="true" />
      </>
    );
  }

  if (variant === 'auth') {
    return (
      <>
        <div className="glow-spot bg-primary-600 top-[-20%] left-[-10%]" aria-hidden="true" />
        <div className="glow-spot bg-indigo-700 bottom-[-20%] right-[-10%]" aria-hidden="true" />
      </>
    );
  }

  return (
    <>
      <div className="glow-spot bg-primary-600 top-[-10%] left-[-10%]" aria-hidden="true" />
      <div className="glow-spot bg-indigo-600 bottom-[-10%] right-[-10%]" aria-hidden="true" />
    </>
  );
};

export default GlowBackground;
