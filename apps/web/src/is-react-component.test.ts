import { createElement, forwardRef } from "react";
import { describe, expect, it } from "vitest";

import { isForwardRefComponent, isReactComponent } from "../utils/is-react-component";

const ForwardIcon = forwardRef<SVGSVGElement, { className?: string }>(function ForwardIcon(props, ref) {
  return createElement("svg", { ref, ...props });
});

describe("isForwardRefComponent", () => {
  it("detects components created with React.forwardRef", () => {
    expect(isForwardRefComponent(ForwardIcon)).toBe(true);
    expect(isReactComponent(ForwardIcon)).toBe(true);
  });

  it("does not throw for objects without $$typeof", () => {
    expect(isForwardRefComponent({ foo: 1 })).toBe(false);
    expect(isForwardRefComponent(null)).toBe(false);
    expect(isForwardRefComponent(undefined)).toBe(false);
  });

  it("does not treat a unique symbol with the same description as a forward ref", () => {
    const impostor = {
      $$typeof: Symbol("react.forward_ref"),
      render() {
        return null;
      },
    };

    expect(impostor.$$typeof.toString()).toBe("Symbol(react.forward_ref)");
    expect(isForwardRefComponent(impostor)).toBe(false);
  });

  it("still treats function components as React components", () => {
    const FunctionIcon = () => createElement("svg");

    expect(isForwardRefComponent(FunctionIcon)).toBe(false);
    expect(isReactComponent(FunctionIcon)).toBe(true);
  });
});
