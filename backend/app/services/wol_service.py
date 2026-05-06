import socket


def send_magic_packet(mac_address: str, broadcast_ip: str = "255.255.255.255") -> bool:
    cleaned = mac_address.replace(":", "").replace("-", "").strip()
    if len(cleaned) != 12:
        return False

    data = bytes.fromhex("FF" * 6 + cleaned * 16)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(data, (broadcast_ip, 9))
    return True
