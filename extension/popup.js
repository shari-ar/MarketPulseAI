const message = document.getElementById("message");
const ping = document.getElementById("ping");

ping.addEventListener("click", () => {
  message.textContent = "Hello MarketPulseAI!";
});
