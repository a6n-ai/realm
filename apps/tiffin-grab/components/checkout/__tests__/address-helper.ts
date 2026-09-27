import { fireEvent, screen } from "@testing-library/react";

// The kit Sheet animates with the Web Animations API, which jsdom lacks.
if (typeof Element !== "undefined" && !Element.prototype.animate) {
  Element.prototype.animate = function () {
    return {
      cancel() {},
      finished: Promise.resolve(),
      set onfinish(done: (() => void) | null) {
        if (done) setTimeout(done);
      },
    } as unknown as Animation;
  };
}

/** Adds a delivery address through the address sheet, the way a customer does. */
export async function enterAddress(postalCode: string, street = "10 King St W") {
  fireEvent.click(await screen.findByRole("button", { name: /add (delivery|new) address/i }));
  fireEvent.change(await screen.findByLabelText(/street address/i), { target: { value: street } });
  fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: postalCode } });
  fireEvent.click(screen.getByRole("button", { name: /use this address/i }));
}
