/**
 * 测试数据 fixtures
 * Sprint 4 / W4.E.1
 *
 * 与后端 e2e seed 数据保持 ID 一致；不涉及真业务源码，仅供 spec 引用。
 */

const ADDRESSES = {
  default: {
    id: 'addr_001',
    name: '张三',
    phone: '13800000001',
    province: '上海市',
    city: '上海市',
    district: '浦东新区',
    detail: '张江高科技园区博云路 2 号',
    lng: 121.605,
    lat: 31.205
  },
  pickup: {
    id: 'addr_002',
    name: '李四',
    phone: '13800000002',
    province: '上海市',
    city: '上海市',
    district: '浦东新区',
    detail: '陆家嘴东方明珠塔下',
    lng: 121.499,
    lat: 31.24
  }
}

const SHOPS = {
  primary: {
    id: 'shop_e2e_001',
    name: 'E2E 测试餐厅',
    keyword: 'E2E'
  }
}

const PRODUCTS = {
  burger: { id: 'p_burger_01', name: '经典汉堡', price: 25.0, qty: 2 },
  drink: { id: 'p_drink_01', name: '可乐', price: 6.0, qty: 1 }
}

const ERRAND = {
  itemType: '文件',
  weight: 1,
  remark: 'E2E 自动化测试单，请勿真实派送'
}

const ORDERS = {
  unpaid: { id: 'order_unpaid_e2e_001', amount: 56.0 },
  paid: { id: 'order_paid_e2e_001', amount: 56.0 }
}

module.exports = {
  ADDRESSES,
  SHOPS,
  PRODUCTS,
  ERRAND,
  ORDERS
}
