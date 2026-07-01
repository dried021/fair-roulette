import matplotlib.pyplot as plt

labels = ["1등", "2등", "3등", "4등", "5등"]
sizes = [10, 15, 20, 25, 30]

plt.figure(figsize=(8, 8))
plt.pie(
    sizes,
    labels=[f"{label}\n{size}%" for label, size in zip(labels, sizes)],
    startangle=90,
    counterclock=False,
    wedgeprops={"edgecolor": "white", "linewidth": 2},
    textprops={"fontsize": 14, "weight": "bold"},
)

plt.title("Roulette Probability Board", fontsize=18, weight="bold")
plt.axis("equal")

plt.savefig("roulette_board.png", dpi=300, bbox_inches="tight", transparent=True)
plt.show()