/**
 * Every creature the viewer can find. Facts are kept to well-established
 * science and phrased without overclaiming.
 */
export type DiscoveryId =
  | 'barramundi'
  | 'baitball'
  | 'manta'
  | 'whale'
  | 'atolla'
  | 'driftjelly'
  | 'squid'
  | 'lanternfish'
  | 'anglerfish'
  | 'combjelly'
  | 'seapen'

export interface Discovery {
  id: DiscoveryId
  name: string
  latin: string
  /** Zone index 0…3 (the whale lives between I and II). */
  zone: number
  depth: string
  facts: [string, string]
  /** Shown in the logbook while still undiscovered. */
  hint: string
  secret?: boolean
}

export const DISCOVERIES: Discovery[] = [
  {
    id: 'barramundi',
    name: 'Cá chẽm',
    latin: 'Lates calcarifer',
    zone: 0,
    depth: '0 – 40 m',
    facts: [
      'Hầu hết cá chẽm sinh ra là cá đực, rồi chuyển thành cá cái khi lớn lên — thường vào khoảng năm thứ ba đến năm thứ năm.',
      'Chúng sống được cả ở nước ngọt lẫn nước mặn, bơi ra cửa sông để sinh sản.',
    ],
    hint: 'Đàn cá lớn giữa những cột nắng.',
  },
  {
    id: 'baitball',
    name: 'Đàn cá mồi',
    latin: 'Atherinidae',
    zone: 0,
    depth: '0 – 30 m',
    facts: [
      'Khi bị săn, cá mồi xoắn lại thành một "quả cầu" xoay tròn: hàng trăm thân bạc loé sáng khiến kẻ săn mồi khó nhắm vào một con.',
      'Mỗi con chỉ phản ứng với vài con ở gần, nhưng cả đàn chuyển động như một cơ thể duy nhất.',
    ],
    hint: 'Một vòng xoáy bạc ở xa bên trái.',
  },
  {
    id: 'manta',
    name: 'Cá đuối manta',
    latin: 'Mobula birostris',
    zone: 0,
    depth: '0 – 120 m',
    facts: [
      'Sải vây của cá đuối manta khổng lồ có thể vượt 7 mét, nhưng chúng chỉ ăn sinh vật phù du.',
      'Chúng có bộ não lớn nhất so với kích thước cơ thể trong các loài cá.',
    ],
    hint: 'Một cái bóng lớn lượn trên cao.',
  },
  {
    id: 'whale',
    name: 'Cá voi lưng gù',
    latin: 'Megaptera novaeangliae',
    zone: 0,
    depth: '0 – 200 m',
    facts: [
      'Cá voi lưng gù đực hát những bài hát phức tạp kéo dài hàng chục phút, và bài hát thay đổi dần qua từng mùa.',
      'Vây ngực của chúng dài tới khoảng một phần ba chiều dài cơ thể — dài nhất trong các loài cá voi.',
    ],
    hint: 'Bí mật: hãy để ý khoảng lặng giữa vùng nắng và vùng chạng vạng.',
    secret: true,
  },
  {
    id: 'atolla',
    name: 'Sứa vương miện',
    latin: 'Atolla wyvillei',
    zone: 1,
    depth: '500 – 1 500 m',
    facts: [
      'Khi bị tấn công, nó phát ra những vòng sáng xanh xoay tròn — "chuông báo động" gọi kẻ săn mồi lớn hơn đến ăn kẻ đang tấn công nó.',
      'Màu đỏ thẫm của nó gần như vô hình dưới biển sâu, nơi ánh sáng đỏ đã bị nước hấp thụ hết.',
    ],
    hint: 'Nhân vật chính của vùng chạng vạng.',
  },
  {
    id: 'driftjelly',
    name: 'Sứa nhỏ phát quang',
    latin: 'Hydrozoa',
    zone: 1,
    depth: '200 – 1 000 m',
    facts: [
      'Khảo sát bằng tàu lặn cho thấy khoảng 3/4 động vật sống ở vùng nước mở biển sâu có khả năng tự phát sáng.',
      'Protein phát quang xanh GFP, lấy từ một loài sứa nhỏ, đã mang về giải Nobel Hoá học năm 2008.',
    ],
    hint: 'Những đốm sáng trôi quanh sứa vương miện.',
  },
  {
    id: 'squid',
    name: 'Mực đèn Dana',
    latin: 'Taningia danae',
    zone: 2,
    depth: '500 – 1 000 m',
    facts: [
      'Nó mang những cơ quan phát sáng thuộc loại lớn nhất trong giới động vật, ở đầu hai xúc tu — to cỡ quả chanh.',
      'Nó chớp sáng thật mạnh trước khi tấn công, có thể để làm con mồi loá mắt hoặc để đo khoảng cách.',
    ],
    hint: 'Kẻ bơi xuyên qua vùng nửa tối.',
  },
  {
    id: 'lanternfish',
    name: 'Cá đèn',
    latin: 'Myctophidae',
    zone: 2,
    depth: '300 – 1 200 m',
    facts: [
      'Mỗi đêm hàng tỉ con cá đèn bơi lên gần mặt nước để kiếm ăn — cuộc di cư lớn nhất hành tinh.',
      'Đàn của chúng dày đến mức sonar thời Thế chiến II tưởng là một "đáy biển giả" — lớp tán xạ sâu.',
    ],
    hint: 'Một đàn chấm sáng phía sau con mực.',
  },
  {
    id: 'anglerfish',
    name: 'Cá câu vực thẳm',
    latin: 'Melanocetus johnsonii',
    zone: 3,
    depth: '1 000 – 2 500 m',
    facts: [
      'Ánh sáng ở "mồi câu" không do cá tự tạo mà do hàng tỉ vi khuẩn phát quang sống cộng sinh bên trong.',
      'Dạ dày co giãn cho phép nó nuốt con mồi lớn gần bằng chính cơ thể mình.',
    ],
    hint: 'Nguồn sáng duy nhất ở vực thẳm.',
  },
  {
    id: 'combjelly',
    name: 'Sứa lược',
    latin: 'Ctenophora',
    zone: 3,
    depth: '0 – 7 000 m',
    facts: [
      'Cầu vồng chạy dọc thân không phải phát quang: đó là ánh sáng tán xạ trên 8 hàng lông bơi đang đập.',
      'Chúng thuộc một trong những nhánh động vật cổ xưa nhất, đã có mặt từ hơn 500 triệu năm trước.',
    ],
    hint: 'Những chiếc đèn lồng cầu vồng quanh cá câu.',
  },
  {
    id: 'seapen',
    name: 'Lông biển',
    latin: 'Pennatulacea',
    zone: 3,
    depth: '20 – 6 000 m',
    facts: [
      'Mỗi "chiếc lông" là cả một quần thể: hàng trăm polyp nhỏ sống chung, mỗi con đảm nhận một việc.',
      'Khi bị chạm vào, sóng ánh sáng xanh chạy dọc thân chúng.',
    ],
    hint: 'Những ngọn lông phát sáng cắm trên đáy vực.',
  },
]

export const DISCOVERY_BY_ID = Object.fromEntries(DISCOVERIES.map((d) => [d.id, d])) as Record<DiscoveryId, Discovery>
export const TOTAL_DISCOVERIES = DISCOVERIES.length
